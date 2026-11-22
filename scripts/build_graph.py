#!/usr/bin/env python3
"""
Music Lyricist Knowledge Graph Builder

歌手ごとのディレクトリ (artists/<slug>/) にある artist.json と songs.json を読み込み、
データの整合性チェックを行った上で、可視化・グラフ分析にそのまま利用できる
knowledge_graph.json (nodes & edges 形式) を生成します。

使い方:
    python scripts/build_graph.py --artist shiina_ringo
    python scripts/build_graph.py --all
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
ARTISTS_DIR = ROOT_DIR / "artists"
WEB_DATA_DIR = ROOT_DIR / "web" / "data"
SCHEMA_VERSION = "1.0.0"

LANGUAGE_LABELS = {
    "ja": "日本語",
    "en": "英語",
    "fr": "フランス語",
    "es": "スペイン語",
    "de": "ドイツ語",
    "it": "イタリア語",
}

ACTIVITY_LABELS = {
    "solo": "ソロ名義",
    "tokyo_jihen": "東京事変",
    "collaboration": "コラボレーション・デュエット",
    "written_for": "楽曲提供",
}


def make_id(prefix: str, text: str) -> str:
    """日本語ラベルなどから安定した一意IDを生成する。"""
    digest = hashlib.md5(text.encode("utf-8")).hexdigest()[:10]
    return f"{prefix}_{digest}"


class GraphBuilder:
    def __init__(self, artist_data: dict[str, Any], songs_data: list[dict[str, Any]]) -> None:
        self.artist = artist_data
        self.songs = songs_data
        self.nodes: dict[str, dict[str, Any]] = {}
        self.edges: dict[tuple[str, str, str], dict[str, Any]] = {}
        self.song_relations_edges: list[dict[str, Any]] = []

    def add_node(self, node_id: str, node_type: str, label: str, properties: dict[str, Any] | None = None) -> str:
        if node_id not in self.nodes:
            self.nodes[node_id] = {
                "id": node_id,
                "type": node_type,
                "label": label,
                "properties": properties or {},
            }
        elif properties:
            self.nodes[node_id]["properties"].update(properties)
        return node_id

    def add_edge(
        self,
        source: str,
        target: str,
        edge_type: str,
        weight: float = 1.0,
        properties: dict[str, Any] | None = None,
    ) -> None:
        key = (source, target, edge_type)
        if key not in self.edges:
            edge_id = f"edge_{hashlib.md5(f'{source}|{target}|{edge_type}'.encode('utf-8')).hexdigest()[:12]}"
            self.edges[key] = {
                "id": edge_id,
                "source": source,
                "target": target,
                "type": edge_type,
                "weight": weight,
                "properties": properties or {},
            }
        else:
            self.edges[key]["weight"] += weight
            if properties:
                self.edges[key]["properties"].update(properties)

    def validate(self) -> None:
        seen_ids: set[str] = set()
        required_fields = [
            "id",
            "title",
            "release_year",
            "activity_type",
            "performer",
            "lyricist",
            "composer",
            "albums",
            "era",
            "themes",
            "motifs",
            "places",
            "linguistic_features",
            "languages",
            "sentiment_mood",
        ]
        artist_name = self.artist["name"]
        for idx, song in enumerate(self.songs):
            for field in required_fields:
                if field not in song:
                    raise ValueError(f"Song index {idx} ({song.get('title')}) missing required field: {field}")
            sid = song["id"]
            if sid in seen_ids:
                raise ValueError(f"Duplicate song id detected: {sid}")
            seen_ids.add(sid)
            if artist_name not in song["lyricist"]:
                raise ValueError(f"Song '{song['title']}' does not list '{artist_name}' as lyricist: {song['lyricist']}")

        # Verify related_songs references
        for song in self.songs:
            for rel in song.get("related_songs", []):
                target_id = rel.get("target_id")
                if target_id not in seen_ids:
                    raise ValueError(
                        f"Song '{song['title']}' ({song['id']}) references unknown related_song target_id: {target_id}"
                    )

    def build(self) -> dict[str, Any]:
        self.validate()

        main_artist_name = self.artist["name"]
        main_artist_id = self.artist["id"]

        # Main Artist node
        self.add_node(
            main_artist_id,
            "Artist",
            main_artist_name,
            {
                "name_en": self.artist.get("name_en"),
                "debut_year": self.artist.get("debut_year"),
                "origin": self.artist.get("origin"),
                "roles": self.artist.get("roles", []),
                "is_primary_lyricist": True,
            },
        )

        # Era nodes from artist metadata
        era_map: dict[str, str] = {}
        for era in self.artist.get("eras", []):
            era_id = era["id"]
            era_label = era["label"]
            era_map[era_label] = era_id
            era_map[era_id] = era_id
            self.add_node(
                era_id,
                "Era",
                era_label,
                {
                    "period": era.get("period"),
                    "description": era.get("description"),
                },
            )

        artist_name_to_id: dict[str, str] = {main_artist_name: main_artist_id}

        def get_or_create_artist(name: str, role: str | None = None) -> str:
            if name in artist_name_to_id:
                aid = artist_name_to_id[name]
            else:
                aid = make_id("artist", name)
                artist_name_to_id[name] = aid
                self.add_node(aid, "Artist", name, {"roles": [], "is_primary_lyricist": False})
            if role:
                roles = self.nodes[aid]["properties"].setdefault("roles", [])
                if role not in roles:
                    roles.append(role)
            return aid

        # Counters for summary stats
        theme_counter: Counter[str] = Counter()
        motif_counter: Counter[str] = Counter()
        place_counter: Counter[str] = Counter()
        style_counter: Counter[str] = Counter()
        activity_counter: Counter[str] = Counter()
        decade_counter: Counter[str] = Counter()

        # Lyric token stats & co-occurrence tracking
        token_freq: Counter[str] = Counter()
        token_song_count: Counter[str] = Counter()
        token_category: dict[str, str] = {}
        token_era_counts: dict[str, Counter[str]] = defaultdict(Counter)
        cooccur_songs: Counter[tuple[str, str]] = Counter()
        cooccur_weight: Counter[tuple[str, str]] = Counter()

        for song in self.songs:
            sid = song["id"]
            activity_type = song["activity_type"]
            activity_counter[activity_type] += 1
            decade = f"{(song['release_year'] // 10) * 10}s"
            decade_counter[decade] += 1

            # Song node
            self.add_node(
                sid,
                "Song",
                song["title"],
                {
                    "release_year": song["release_year"],
                    "activity_type": activity_type,
                    "activity_label": ACTIVITY_LABELS.get(activity_type, activity_type),
                    "performer": song["performer"],
                    "lyricist": song["lyricist"],
                    "composer": song["composer"],
                    "albums": song["albums"],
                    "era": song["era"],
                    "languages": song["languages"],
                    "tie_up": song.get("tie_up"),
                    "summary": song.get("summary"),
                },
            )

            # Lyricists
            for lyr in song["lyricist"]:
                lyr_id = get_or_create_artist(lyr, "作詞家")
                self.add_edge(lyr_id, sid, "LYRICIST_OF", properties={"co_lyricist": len(song["lyricist"]) > 1})
                if lyr_id != main_artist_id:
                    self.add_edge(main_artist_id, lyr_id, "COLLABORATED_WITH", properties={"context": "共作詞"})

            # Composers
            for comp in song["composer"]:
                comp_id = get_or_create_artist(comp, "作曲家")
                self.add_edge(comp_id, sid, "COMPOSER_OF")
                if comp_id != main_artist_id:
                    self.add_edge(main_artist_id, comp_id, "COLLABORATED_WITH", properties={"context": "作曲提供・バンド共作"})

            # Performer / Collaborator / Written For
            performer = song["performer"]
            if activity_type == "written_for":
                perf_id = get_or_create_artist(performer, "提供先アーティスト")
                self.add_edge(sid, perf_id, "WRITTEN_FOR")
                self.add_edge(sid, perf_id, "PERFORMED_BY")
                self.add_edge(main_artist_id, perf_id, "COLLABORATED_WITH", properties={"context": "楽曲提供"})
            elif activity_type == "collaboration":
                for partner in song.get("collaborators", []):
                    partner_id = get_or_create_artist(partner, "コラボ・客演")
                    self.add_edge(sid, partner_id, "PERFORMED_BY")
                    if partner_id != main_artist_id:
                        self.add_edge(main_artist_id, partner_id, "COLLABORATED_WITH", properties={"context": "デュエット・客演"})
                self.add_edge(sid, main_artist_id, "PERFORMED_BY")
            elif activity_type == "tokyo_jihen":
                band_id = get_or_create_artist("東京事変", "バンド")
                self.add_edge(sid, band_id, "PERFORMED_BY")
            else:
                perf_id = get_or_create_artist(performer, "歌手")
                self.add_edge(sid, perf_id, "PERFORMED_BY")

            # Albums
            for alb in song["albums"]:
                alb_id = make_id("album", alb)
                self.add_node(alb_id, "Album", alb, {})
                self.add_edge(sid, alb_id, "INCLUDED_IN")

            # Era
            era_val = song["era"]
            era_id = era_map.get(era_val)
            if not era_id:
                era_id = make_id("era", era_val)
                self.add_node(era_id, "Era", era_val, {})
            self.add_edge(sid, era_id, "BELONGS_TO_ERA")

            # Themes
            for theme in song["themes"]:
                theme_counter[theme] += 1
                tid = make_id("theme", theme)
                self.add_node(tid, "Theme", theme, {})
                self.add_edge(sid, tid, "HAS_THEME")

            # Motifs
            for motif in song["motifs"]:
                motif_counter[motif] += 1
                mid = make_id("motif", motif)
                self.add_node(mid, "Motif", motif, {})
                self.add_edge(sid, mid, "HAS_MOTIF")

            # Places
            for place in song["places"]:
                place_counter[place] += 1
                pid = make_id("place", place)
                self.add_node(pid, "Place", place, {})
                self.add_edge(sid, pid, "MENTIONS_PLACE")

            # Linguistic styles
            for style in song["linguistic_features"]:
                style_counter[style] += 1
                stid = make_id("style", style)
                self.add_node(stid, "Style", style, {})
                self.add_edge(sid, stid, "USES_STYLE")

            # Moods
            for mood in song["sentiment_mood"]:
                mood_id = make_id("mood", mood)
                self.add_node(mood_id, "Mood", mood, {})
                self.add_edge(sid, mood_id, "HAS_MOOD")

            # Languages
            for lang in song["languages"]:
                lang_label = LANGUAGE_LABELS.get(lang, lang)
                lang_id = f"lang_{lang}"
                self.add_node(lang_id, "Language", lang_label, {"code": lang})
                self.add_edge(sid, lang_id, "WRITTEN_IN_LANGUAGE")

            # Lyric tokens (words & co-occurrences)
            raw_tokens = song.get("lyric_tokens", [])
            song_token_pairs: list[tuple[str, int]] = []
            for item in raw_tokens:
                tok = item["token"]
                cat = item.get("category", "その他")
                w = int(item.get("weight", 1))
                tok_id = make_id("token", tok)
                token_freq[tok] += w
                token_song_count[tok] += 1
                token_category[tok] = cat
                token_era_counts[tok][era_val] += 1
                self.add_node(tok_id, "Token", tok, {"category": cat})
                self.add_edge(sid, tok_id, "CONTAINS_TOKEN", weight=float(w))
                song_token_pairs.append((tok, w))

            # Pairwise co-occurrence within the same song
            for i in range(len(song_token_pairs)):
                t1, w1 = song_token_pairs[i]
                for j in range(i + 1, len(song_token_pairs)):
                    t2, w2 = song_token_pairs[j]
                    pair = (t1, t2) if t1 < t2 else (t2, t1)
                    cooccur_songs[pair] += 1
                    cooccur_weight[pair] += min(w1, w2)

            # Song-to-song relations
            for rel in song.get("related_songs", []):
                target_id = rel["target_id"]
                rel_kind = rel.get("relation", "RELATED")
                note = rel.get("note", "")
                edge_id = f"edge_{hashlib.md5(f'{sid}|{target_id}|RELATED_SONG|{rel_kind}'.encode('utf-8')).hexdigest()[:12]}"
                self.song_relations_edges.append(
                    {
                        "id": edge_id,
                        "source": sid,
                        "target": target_id,
                        "type": "RELATED_SONG",
                        "weight": 1.0,
                        "properties": {
                            "relation": rel_kind,
                            "note": note,
                        },
                    }
                )

        # Enrich Token nodes with frequency, song_count, era distribution, and top co-occurrences
        per_token_co: dict[str, list[tuple[str, int, int]]] = defaultdict(list)
        for (t1, t2), c_songs in cooccur_songs.items():
            cw = cooccur_weight[(t1, t2)]
            per_token_co[t1].append((t2, c_songs, cw))
            per_token_co[t2].append((t1, c_songs, cw))

        selected_co_pairs: set[tuple[str, str]] = set()
        for tok, freq in token_freq.items():
            tok_id = make_id("token", tok)
            co_list = sorted(per_token_co.get(tok, []), key=lambda x: (-x[1], -x[2], x[0]))
            self.nodes[tok_id]["properties"].update(
                {
                    "category": token_category.get(tok, "その他"),
                    "total_frequency": freq,
                    "song_count": token_song_count[tok],
                    "era_counts": dict(token_era_counts[tok]),
                    "top_cooccurrences": [
                        {"token": other, "song_count": cs, "weight": cw}
                        for other, cs, cw in co_list[:10]
                    ],
                }
            )
            # Keep top 4 strongest co-occurrences per token so graph remains structured and readable
            for other, cs, cw in co_list[:4]:
                if cs >= 2 or len(co_list) <= 3:
                    pair = (tok, other) if tok < other else (other, tok)
                    selected_co_pairs.add(pair)

        # Also include globally strong co-occurrence pairs
        for (t1, t2), cs in cooccur_songs.most_common(120):
            if cs >= 6:
                selected_co_pairs.add((t1, t2))

        for t1, t2 in sorted(selected_co_pairs):
            cs = cooccur_songs[(t1, t2)]
            cw = cooccur_weight[(t1, t2)]
            id1 = make_id("token", t1)
            id2 = make_id("token", t2)
            self.add_edge(
                id1,
                id2,
                "CO_OCCURS_WITH",
                weight=float(cs),
                properties={
                    "cooccurrence_songs": cs,
                    "cooccurrence_weight": cw,
                },
            )

        # Compute node degree for visualization sizing
        degree_counter: Counter[str] = Counter()
        all_edges = list(self.edges.values()) + self.song_relations_edges
        for e in all_edges:
            degree_counter[e["source"]] += 1
            degree_counter[e["target"]] += 1

        for nid, node in self.nodes.items():
            node["properties"]["degree"] = degree_counter[nid]

        node_counts = Counter(n["type"] for n in self.nodes.values())
        edge_counts = Counter(e["type"] for e in all_edges)

        top_tokens = [
            {
                "label": tok,
                "count": freq,
                "song_count": token_song_count[tok],
                "category": token_category.get(tok, "その他"),
            }
            for tok, freq in token_freq.most_common()
        ]
        top_cooccurrences = [
            {
                "pair": [t1, t2],
                "label": f"{t1} × {t2}",
                "count": cs,
                "weight": cooccur_weight[(t1, t2)],
            }
            for (t1, t2), cs in cooccur_songs.most_common(30)
        ]

        return {
            "meta": {
                "artist_id": main_artist_id,
                "artist_name": main_artist_name,
                "artist_slug": self.artist["slug"],
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "schema_version": SCHEMA_VERSION,
                "description": f"{main_artist_name}が作詞した楽曲と歌詞語彙の構造化ナレッジグラフ（ノード＆エッジ形式）",
                "copyright_note": "著作権保護のため歌詞全文は収録せず、楽曲メタデータおよび歌詞から抽出した頻出単語トークン・共起関係・テーマ・モチーフ・地名・文体特徴・曲間関係のみを構造化しています。",
            },
            "stats": {
                "total_songs": len(self.songs),
                "total_nodes": len(self.nodes),
                "total_edges": len(all_edges),
                "node_counts_by_type": dict(sorted(node_counts.items())),
                "edge_counts_by_type": dict(sorted(edge_counts.items())),
                "top_themes": [{"label": k, "count": v} for k, v in theme_counter.most_common()],
                "top_motifs": [{"label": k, "count": v} for k, v in motif_counter.most_common()],
                "top_places": [{"label": k, "count": v} for k, v in place_counter.most_common()],
                "top_styles": [{"label": k, "count": v} for k, v in style_counter.most_common()],
                "top_tokens": top_tokens,
                "top_cooccurrences": top_cooccurrences,
                "songs_by_activity_type": dict(sorted(activity_counter.items())),
                "songs_by_decade": dict(sorted(decade_counter.items())),
            },
            "nodes": list(self.nodes.values()),
            "edges": all_edges,
        }


def build_artist(artist_slug: str) -> None:
    artist_dir = ARTISTS_DIR / artist_slug
    artist_path = artist_dir / "artist.json"
    songs_path = artist_dir / "songs.json"
    output_path = artist_dir / "knowledge_graph.json"
    lyrics_output_path = artist_dir / "lyrics_knowledge_graph.json"

    if not artist_path.exists() or not songs_path.exists():
        raise FileNotFoundError(f"Required files missing in {artist_dir}")

    with artist_path.open("r", encoding="utf-8") as f:
        artist_data = json.load(f)
    with songs_path.open("r", encoding="utf-8") as f:
        songs_data = json.load(f)

    builder = GraphBuilder(artist_data, songs_data)
    graph = builder.build()

    with output_path.open("w", encoding="utf-8") as f:
        json.dump(graph, f, ensure_ascii=False, indent=2)

    # Also emit dedicated lyric token co-occurrence knowledge graph JSON
    token_nodes = [n for n in graph["nodes"] if n["type"] == "Token"]
    token_edges = [e for e in graph["edges"] if e["type"] == "CO_OCCURS_WITH"]
    lyrics_graph = {
        "meta": {
            **graph["meta"],
            "description": f"{artist_data['name']}の歌詞頻出単語・トークン共起ナレッジグラフ（ノードサイズ＝出現頻度）",
        },
        "stats": {
            "total_songs": graph["stats"]["total_songs"],
            "total_tokens": len(token_nodes),
            "total_cooccurrence_edges": len(token_edges),
            "top_tokens": graph["stats"]["top_tokens"][:50],
            "top_cooccurrences": graph["stats"]["top_cooccurrences"],
        },
        "nodes": token_nodes,
        "edges": token_edges,
    }
    with lyrics_output_path.open("w", encoding="utf-8") as f:
        json.dump(lyrics_graph, f, ensure_ascii=False, indent=2)

    stats = graph["stats"]
    print(f"[OK] Built knowledge graph for {artist_data['name']} ({artist_slug})")
    print(f"     Songs: {stats['total_songs']} | Nodes: {stats['total_nodes']} | Edges: {stats['total_edges']}")
    print(f"     Lyric Tokens: {len(token_nodes)} | Co-occurrence Edges: {len(token_edges)}")
    print(f"     Outputs: {output_path}, {lyrics_output_path}")


def build_web_bundle() -> None:
    """全アーティストのグラフデータを読み込み、web/data/artists_index.json と web/data/bundle.js を生成する。"""
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    artists_index: list[dict[str, Any]] = []
    bundle_graphs: dict[str, Any] = {}
    bundle_artists: dict[str, Any] = {}

    for sub in sorted(ARTISTS_DIR.iterdir()):
        artist_path = sub / "artist.json"
        graph_path = sub / "knowledge_graph.json"
        if sub.is_dir() and artist_path.exists() and graph_path.exists():
            with artist_path.open("r", encoding="utf-8") as f:
                artist_data = json.load(f)
            with graph_path.open("r", encoding="utf-8") as f:
                graph_data = json.load(f)
            slug = sub.name
            artists_index.append(
                {
                    "slug": slug,
                    "id": artist_data["id"],
                    "name": artist_data["name"],
                    "name_en": artist_data.get("name_en", ""),
                    "debut_year": artist_data.get("debut_year"),
                    "total_songs": graph_data["stats"]["total_songs"],
                    "total_nodes": graph_data["stats"]["total_nodes"],
                    "total_edges": graph_data["stats"]["total_edges"],
                    "graph_path": f"../artists/{slug}/knowledge_graph.json",
                    "artist_path": f"../artists/{slug}/artist.json",
                }
            )
            bundle_artists[slug] = artist_data
            bundle_graphs[slug] = graph_data

    index_path = WEB_DATA_DIR / "artists_index.json"
    with index_path.open("w", encoding="utf-8") as f:
        json.dump(artists_index, f, ensure_ascii=False, indent=2)

    bundle_path = WEB_DATA_DIR / "bundle.js"
    payload = {
        "index": artists_index,
        "artists": bundle_artists,
        "graphs": bundle_graphs,
    }
    with bundle_path.open("w", encoding="utf-8") as f:
        f.write("// Auto-generated by scripts/build_graph.py — enables opening web/index.html directly via file://\n")
        f.write("window.MUSIC_KG_BUNDLE = ")
        json.dump(payload, f, ensure_ascii=False)
        f.write(";\n")

    print(f"[OK] Updated web bundle ({len(artists_index)} artist(s)): {bundle_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build knowledge_graph.json from artist songs.json")
    parser.add_argument("--artist", type=str, help="Artist folder slug under artists/ (e.g., shiina_ringo)")
    parser.add_argument("--all", action="store_true", help="Build knowledge graphs for all artists")
    args = parser.parse_args()

    if args.all:
        for sub in sorted(ARTISTS_DIR.iterdir()):
            if sub.is_dir() and (sub / "artist.json").exists() and (sub / "songs.json").exists():
                build_artist(sub.name)
        build_web_bundle()
    elif args.artist:
        build_artist(args.artist)
        build_web_bundle()
    else:
        parser.error("Specify --artist <slug> or --all")


if __name__ == "__main__":
    main()
