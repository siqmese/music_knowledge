#!/usr/bin/env python3
"""
手元の歌詞テキストファイル群から出現単語・トークンを抽出し、
artists/<slug>/songs.json の lyric_tokens を実出現回数ベースで更新するスクリプト。

使い方:
    1. artists/<slug>/lyrics_raw/ フォルダに `<song_id>.txt` または `<曲名>.txt` を配置
    2. python scripts/extract_lyrics_tokens.py --artist shiina_ringo
    3. python scripts/build_graph.py --artist shiina_ringo

※ janome が入っている場合は自動で形態素解析を行い、未導入の場合は簡易日本語トークナイザにフォールバックします。
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
ARTISTS_DIR = ROOT_DIR / "artists"

STOPWORDS = {
    "こと", "もの", "それ", "これ", "あれ", "どれ", "ここ", "そこ", "あそこ",
    "よう", "ため", "わけ", "はず", "ところ", "みたい", "そう", "どう",
    "いる", "ある", "なる", "する", "できる", "くる", "いく", "みる",
    "ない", "いい", "よい", "もう", "まだ", "ただ", "でも", "けど", "から",
    "まで", "だけ", "ほど", "など", "なら", "って", "じゃ", "ちゃう",
}


def tokenize_text(text: str) -> Counter[str]:
    """テキストから名詞・動詞・形容詞などの内容語トークン出現回数を集計する。"""
    try:
        from janome.tokenizer import Tokenizer  # type: ignore

        tokenizer = Tokenizer()
        counts: Counter[str] = Counter()
        for tok in tokenizer.tokenize(text):
            pos = tok.part_of_speech.split(",")[0]
            sub = tok.part_of_speech.split(",")[1]
            if pos in ("名詞", "動詞", "形容詞") and sub not in ("非自立", "代名詞", "数", "接尾"):
                base = tok.base_form if tok.base_form != "*" else tok.surface
                if len(base) >= 1 and base not in STOPWORDS:
                    counts[base] += 1
        return counts
    except ImportError:
        # 簡易フォールバック（漢字語・カタカナ語・英単語を抽出）
        pattern = re.compile(r"[一-龥々]{1,6}|[ァ-ヶー]{2,10}|[A-Za-z]{3,16}")
        counts = Counter()
        for match in pattern.findall(text):
            w = match.lower() if match.isascii() else match
            if w not in STOPWORDS:
                counts[w] += 1
        return counts


def update_from_raw_lyrics(artist_slug: str, top_k: int = 18) -> None:
    artist_dir = ARTISTS_DIR / artist_slug
    songs_path = artist_dir / "songs.json"
    raw_dir = artist_dir / "lyrics_raw"

    if not raw_dir.exists():
        raise FileNotFoundError(
            f"歌詞テキストフォルダが見つかりません: {raw_dir}\n"
            f"各曲の歌詞を `<song_id>.txt` または `<曲名>.txt` として配置してください。"
        )

    with songs_path.open("r", encoding="utf-8") as f:
        songs = json.load(f)

    updated = 0
    for song in songs:
        cand_by_id = raw_dir / f"{song['id']}.txt"
        cand_by_title = raw_dir / f"{song['title']}.txt"
        target = cand_by_id if cand_by_id.exists() else (cand_by_title if cand_by_title.exists() else None)
        if not target:
            continue

        text = target.read_text(encoding="utf-8")
        counts = tokenize_text(text)
        existing_cats = {t["token"]: t.get("category", "その他") for t in song.get("lyric_tokens", [])}
        song["lyric_tokens"] = [
            {
                "token": tok,
                "category": existing_cats.get(tok, "抽出語彙"),
                "weight": cnt,
            }
            for tok, cnt in counts.most_common(top_k)
        ]
        updated += 1

    with songs_path.open("w", encoding="utf-8") as f:
        json.dump(songs, f, ensure_ascii=False, indent=2)

    print(f"[OK] Updated lyric_tokens for {updated} song(s) in {songs_path}")
    print(f"     Run `python scripts/build_graph.py --artist {artist_slug}` to rebuild the graph.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract lyric tokens from local raw lyrics files")
    parser.add_argument("--artist", required=True, help="Artist folder slug under artists/")
    parser.add_argument("--top-k", type=int, default=18, help="Max tokens per song")
    args = parser.parse_args()
    update_from_raw_lyrics(args.artist, args.top_k)


if __name__ == "__main__":
    main()
