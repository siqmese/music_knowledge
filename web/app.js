(() => {
  "use strict";

  // =========================================================================
  // Constants & Visual Palette
  // =========================================================================
  const NODE_TYPE_META = {
    Token:    { label: "歌詞ワード",    color: "#b82925", radiusBase: 8,    priority: 6 },
    Song:     { label: "楽曲",          color: "#4d5b6e", radiusBase: 5.5,  priority: 1 },
    Theme:    { label: "テーマ",        color: "#b82925", radiusBase: 14,   priority: 5 },
    Motif:    { label: "モチーフ",      color: "#c86432", radiusBase: 13,   priority: 4 },
    Place:    { label: "地名・場所",    color: "#487872", radiusBase: 12,   priority: 5 },
    Artist:   { label: "アーティスト",  color: "#4d5b6e", radiusBase: 11,   priority: 4 },
    Album:    { label: "アルバム",      color: "#b89130", radiusBase: 11,   priority: 3 },
    Style:    { label: "作詞技法",      color: "#c86432", radiusBase: 13,   priority: 4 },
    Mood:     { label: "雰囲気",        color: "#b89130", radiusBase: 12,   priority: 3 },
    Era:      { label: "活動期",        color: "#487872", radiusBase: 14,   priority: 4 },
    Language: { label: "使用言語",      color: "#4d5b6e", radiusBase: 11,   priority: 3 },
  };

  const TOKEN_CATEGORY_META = {
    "人称・関係":       { color: "#b82925" },
    "身体・感覚・医療": { color: "#c86432" },
    "自然・時間・空間": { color: "#487872" },
    "感情・概念・思想": { color: "#1a1917" },
    "都市・事物・文化": { color: "#4d5b6e" },
    "色彩":             { color: "#b89130" },
  };

  const ACTIVITY_META = {
    solo:            { label: "ソロ名義",       color: "#b82925" },
    tokyo_jihen:     { label: "東京事変",       color: "#4d5b6e" },
    collaboration:   { label: "コラボ・客演",   color: "#b89130" },
    written_for:     { label: "楽曲提供",       color: "#487872" },
    unreleased_demo: { label: "未発表・デモ等", color: "#c86432" },
  };

  const RELATION_LABELS = {
    SYMMETRY_PAIR: "対称構造ペア (シンメトリー)",
    THEMATIC_PAIR: "テーマ対",
    SELF_REMAKE:   "セルフカバー・再構築",
    PROTOTYPE_OF:  "デモ原曲 → 完成曲",
    MOTIF_LINEAGE: "モチーフの系譜",
    SERIES_PAIR:   "シリーズ・連作ペア",
    RELATED:       "関連曲",
  };

  const PRESETS = {
    lyrics_cooccur: {
      types: ["Token"],
      onlyConnectedSongs: false,
      onlyRelatedSongs: false,
      onlyCooccurrence: true,
      description: "歌詞に頻出する単語・トークンの共起ナレッジグラフです。よく出てくる単語ほど大きなノードになり、同じ曲に一緒に出やすい単語同士が太い線で結ばれます。",
    },
    lyrics_songs: {
      types: ["Song", "Token"],
      onlyConnectedSongs: true,
      onlyRelatedSongs: false,
      onlyCooccurrence: false,
      description: "楽曲と歌詞の頻出単語を直接結んだネットワークです。左の「最小曲数」スライダーで頻出語を絞り込めます。",
    },
    worldview: {
      types: ["Song", "Theme", "Motif"],
      onlyConnectedSongs: false,
      onlyRelatedSongs: false,
      onlyCooccurrence: false,
      description: "楽曲と歌詞のテーマ・モチーフの関係を可視化します。",
    },
    relations: {
      types: ["Song"],
      onlyConnectedSongs: false,
      onlyRelatedSongs: true,
      onlyCooccurrence: false,
      description: "アルバムの対称ペアや「いろは歌」「花札」「新宿」などの曲間リンクのみを抽出します。",
    },
    places: {
      types: ["Song", "Place"],
      onlyConnectedSongs: true,
      onlyRelatedSongs: false,
      onlyCooccurrence: false,
      description: "新宿・東京・銀座・福岡・パリなど、歌詞に登場する実在地名と楽曲のマップです。",
    },
    artists: {
      types: ["Song", "Artist"],
      onlyConnectedSongs: false,
      onlyRelatedSongs: false,
      onlyCooccurrence: false,
      description: "作詞家・作曲家・バンド・コラボ相手・楽曲提供先アーティストの人脈ネットワークです。",
    },
    styles: {
      types: ["Song", "Style", "Mood"],
      onlyConnectedSongs: false,
      onlyRelatedSongs: false,
      onlyCooccurrence: false,
      description: "旧仮名遣い・対称構造・多言語詞・掛詞などの作詞技法と感情トーンの分布です。",
    },
    all: {
      types: Object.keys(NODE_TYPE_META).filter((t) => t !== "Token"),
      onlyConnectedSongs: false,
      onlyRelatedSongs: false,
      onlyCooccurrence: false,
      description: "楽曲とメタデータ全種別を表示します。左パネルから「歌詞ワード」を含めて自由にON/OFFできます。",
    },
  };

  // =========================================================================
  // Application State
  // =========================================================================
  const state = {
    artistsIndex: [],
    currentSlug: null,
    artistProfile: null,
    rawGraph: null,
    nodeById: new Map(),
    allEdges: [],
    adjacency: new Map(), // nodeId -> Array<edge>

    // Active filters
    preset: "lyrics_cooccur",
    enabledTypes: new Set(PRESETS.lyrics_cooccur.types),
    enabledActivities: new Set(Object.keys(ACTIVITY_META)),
    enabledTokenCategories: new Set(Object.keys(TOKEN_CATEGORY_META)),
    minTokenSongs: 5,
    yearMin: 1998,
    yearMax: 2026,
    dataYearMin: 1998,
    dataYearMax: 2026,
    egoRootId: null,

    // Visible subset & layout
    nodes: [],
    edges: [],
    visibleNodeMap: new Map(),
    visibleAdj: new Map(),
    visMinRadius: 6,
    visMaxRadius: 44,

    // Simulation params (default: static locked non-overlapping layout)
    running: false,
    alpha: 0,
    repulsion: 220,
    edgeAlpha: 0.15,
    labelMode: "smart",

    // Distribution interval settings (custom year bins or era)
    distMode: "years",
    distStepYears: 3,

    // Camera
    camX: 0,
    camY: 0,
    zoom: 0.85,
    targetCam: null,

    // Interaction
    hoveredNode: null,
    selectedNode: null,
    dragNode: null,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    camStartX: 0,
    camStartY: 0,
    pointerDownTime: 0,
    pointerMoved: false,
    ignoreCanvasUntil: 0,
  };

  // =========================================================================
  // DOM Elements
  // =========================================================================
  const canvas = document.getElementById("graphCanvas");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("canvasStage");

  const elArtistSelect = document.getElementById("artistSelect");
  const elPresetTabs = document.getElementById("presetTabs");
  const elSearchInput = document.getElementById("searchInput");
  const elSearchResults = document.getElementById("searchResults");
  const elActivityFilters = document.getElementById("activityFilters");
  const elTokenCategoryFilters = document.getElementById("tokenCategoryFilters");
  const elMinTokenSongsSlider = document.getElementById("minTokenSongsSlider");
  const elMinTokenSongsLabel = document.getElementById("minTokenSongsLabel");
  const elNodeTypeFilters = document.getElementById("nodeTypeFilters");
  const elYearMin = document.getElementById("yearMin");
  const elYearMax = document.getElementById("yearMax");
  const elYearRangeLabel = document.getElementById("yearRangeLabel");
  const elLabelMode = document.getElementById("labelMode");
  const elRepulsionSlider = document.getElementById("repulsionSlider");
  const elEdgeAlphaSlider = document.getElementById("edgeAlphaSlider");

  const elLeftPanel = document.getElementById("leftPanel");
  const elRightPanel = document.getElementById("rightPanel");
  const elInspectorTypeBadge = document.getElementById("inspectorTypeBadge");
  const elInspectorBody = document.getElementById("inspectorBody");

  const elEgoBanner = document.getElementById("egoBanner");
  const elEgoBannerText = document.getElementById("egoBannerText");
  const elTooltip = document.getElementById("tooltip");
  const elHudNodes = document.getElementById("hudNodes");
  const elHudEdges = document.getElementById("hudEdges");
  const elHudSongs = document.getElementById("hudSongs");

  const elStatsModal = document.getElementById("statsModal");
  const elStatsTitle = document.getElementById("statsTitle");
  const elStatsSubtitle = document.getElementById("statsSubtitle");
  const elStatsContent = document.getElementById("statsContent");

  // =========================================================================
  // Initialization & Data Loading
  // =========================================================================
  async function init() {
    if (window.innerWidth <= 768) {
      elLeftPanel.classList.add("collapsed");
      elRightPanel.classList.add("collapsed");
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    bindEvents();

    if (window.MUSIC_KG_BUNDLE && Array.isArray(window.MUSIC_KG_BUNDLE.index) && window.MUSIC_KG_BUNDLE.index.length > 0) {
      state.artistsIndex = window.MUSIC_KG_BUNDLE.index;
    } else {
      try {
        const res = await fetch("data/artists_index.json");
        state.artistsIndex = await res.json();
      } catch (err) {
        console.error("Failed to load artists_index.json", err);
        elInspectorBody.innerHTML = `<div class="detail-card"><p class="summary-text">データ読み込みに失敗しました。左パネルから <code>knowledge_graph.json</code> を選択するか、<code>python scripts/build_graph.py --all</code> を実行してください。</p></div>`;
        return;
      }
    }

    populateArtistSelect();
    if (state.artistsIndex.length > 0) {
      await loadArtist(state.artistsIndex[0].slug);
    }

    requestAnimationFrame(tick);
  }

  function populateArtistSelect() {
    elArtistSelect.innerHTML = "";
    for (const item of state.artistsIndex) {
      const opt = document.createElement("option");
      opt.value = item.slug;
      opt.textContent = `${item.name}（${item.total_songs}曲）`;
      elArtistSelect.appendChild(opt);
    }
  }

  async function loadArtist(slug) {
    state.currentSlug = slug;
    elArtistSelect.value = slug;
    let graphData = null;
    let artistData = null;

    if (window.MUSIC_KG_BUNDLE && window.MUSIC_KG_BUNDLE.graphs[slug]) {
      graphData = window.MUSIC_KG_BUNDLE.graphs[slug];
      artistData = window.MUSIC_KG_BUNDLE.artists[slug] || null;
    } else {
      const entry = state.artistsIndex.find((a) => a.slug === slug);
      if (entry) {
        const [gRes, aRes] = await Promise.all([
          fetch(entry.graph_path),
          fetch(entry.artist_path).catch(() => null),
        ]);
        graphData = await gRes.json();
        if (aRes && aRes.ok) artistData = await aRes.json();
      }
    }

    if (!graphData) return;
    setGraphData(graphData, artistData);
  }

  function setGraphData(graphData, artistProfile) {
    state.rawGraph = graphData;
    state.artistProfile = artistProfile;
    state.nodeById = new Map();
    state.adjacency = new Map();
    state.allEdges = graphData.edges || [];
    state.selectedNode = null;
    state.hoveredNode = null;
    state.egoRootId = null;

    let minY = 9999;
    let maxY = 0;

    for (const n of graphData.nodes || []) {
      const copy = {
        ...n,
        properties: { ...(n.properties || {}) },
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
      };
      state.nodeById.set(copy.id, copy);
      state.adjacency.set(copy.id, []);
      if (copy.type === "Song" && copy.properties.release_year) {
        minY = Math.min(minY, copy.properties.release_year);
        maxY = Math.max(maxY, copy.properties.release_year);
      }
    }

    for (const e of state.allEdges) {
      if (state.adjacency.has(e.source)) state.adjacency.get(e.source).push(e);
      if (state.adjacency.has(e.target)) state.adjacency.get(e.target).push(e);
    }

    if (minY > maxY) {
      minY = 1990;
      maxY = 2026;
    }
    state.dataYearMin = minY;
    state.dataYearMax = maxY;
    state.yearMin = minY;
    state.yearMax = maxY;
    elYearMin.min = minY;
    elYearMin.max = maxY;
    elYearMin.value = minY;
    elYearMax.min = minY;
    elYearMax.max = maxY;
    elYearMax.value = maxY;
    elYearRangeLabel.textContent = `${minY} – ${maxY}`;

    state.enabledActivities = new Set(Object.keys(ACTIVITY_META));
    state.enabledTokenCategories = new Set(Object.keys(TOKEN_CATEGORY_META));
    buildFilterControls();

    // If uploaded JSON has no Token nodes, fall back to worldview preset
    const hasTokens = Array.from(state.nodeById.values()).some((n) => n.type === "Token");
    const initialPreset = hasTokens ? state.preset : "worldview";
    applyPreset(initialPreset);
    renderArtistOverview();
  }

  // =========================================================================
  // Filter Controls UI
  // =========================================================================
  function buildFilterControls() {
    // Activity checkboxes
    const counts = (state.rawGraph.stats && state.rawGraph.stats.songs_by_activity_type) || {};
    elActivityFilters.innerHTML = "";
    for (const [key, meta] of Object.entries(ACTIVITY_META)) {
      const cnt = counts[key] || 0;
      const label = document.createElement("label");
      label.className = "check-item";
      label.innerHTML = `
        <span class="check-left">
          <input type="checkbox" data-activity="${key}" ${state.enabledActivities.has(key) ? "checked" : ""} />
          <span class="color-dot" style="background:${meta.color}"></span>
          <span>${meta.label}</span>
        </span>
        <span class="count-pill">${cnt}</span>
      `;
      label.querySelector("input").addEventListener("change", (ev) => {
        if (ev.target.checked) state.enabledActivities.add(key);
        else state.enabledActivities.delete(key);
        rebuildVisibleGraph(true);
      });
      elActivityFilters.appendChild(label);
    }

    // Token category checkboxes
    const catCounts = {};
    for (const n of state.nodeById.values()) {
      if (n.type === "Token") {
        const c = n.properties.category || "その他";
        catCounts[c] = (catCounts[c] || 0) + 1;
      }
    }
    elTokenCategoryFilters.innerHTML = "";
    for (const [cat, meta] of Object.entries(TOKEN_CATEGORY_META)) {
      const cnt = catCounts[cat] || 0;
      if (cnt === 0) continue;
      const label = document.createElement("label");
      label.className = "check-item";
      label.innerHTML = `
        <span class="check-left">
          <input type="checkbox" data-token-cat="${cat}" ${state.enabledTokenCategories.has(cat) ? "checked" : ""} />
          <span class="color-dot" style="background:${meta.color}"></span>
          <span>${cat}</span>
        </span>
        <span class="count-pill">${cnt}</span>
      `;
      label.querySelector("input").addEventListener("change", (ev) => {
        if (ev.target.checked) state.enabledTokenCategories.add(cat);
        else state.enabledTokenCategories.delete(cat);
        rebuildVisibleGraph(true);
      });
      elTokenCategoryFilters.appendChild(label);
    }

    // Node type checkboxes
    const nodeCounts = (state.rawGraph.stats && state.rawGraph.stats.node_counts_by_type) || {};
    elNodeTypeFilters.innerHTML = "";
    for (const [type, meta] of Object.entries(NODE_TYPE_META)) {
      const cnt = nodeCounts[type] || 0;
      if (cnt === 0) continue;
      const label = document.createElement("label");
      label.className = "type-toggle";
      label.innerHTML = `
        <span class="check-left">
          <input type="checkbox" data-node-type="${type}" ${state.enabledTypes.has(type) ? "checked" : ""} />
          <span class="color-dot" style="background:${meta.color}"></span>
          <span>${meta.label}</span>
        </span>
        <span class="count-pill" id="typeCount_${type}">${cnt}</span>
      `;
      label.querySelector("input").addEventListener("change", (ev) => {
        if (ev.target.checked) state.enabledTypes.add(type);
        else state.enabledTypes.delete(type);
        state.preset = "custom";
        updatePresetTabUI();
        rebuildVisibleGraph(true);
      });
      elNodeTypeFilters.appendChild(label);
    }
  }

  function syncTypeCheckboxes() {
    elNodeTypeFilters.querySelectorAll("input[data-node-type]").forEach((cb) => {
      cb.checked = state.enabledTypes.has(cb.dataset.nodeType);
    });
  }

  function updatePresetTabUI() {
    elPresetTabs.querySelectorAll(".preset-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.preset === state.preset);
    });
  }

  function applyPreset(presetKey) {
    const cfg = PRESETS[presetKey];
    if (!cfg) return;
    state.preset = presetKey;
    state.egoRootId = null;
    state.enabledTypes = new Set(cfg.types);
    for (const n of state.nodeById.values()) { n.fx = null; n.fy = null; }

    // Tune minTokenSongs sensibly when switching presets
    if (presetKey === "lyrics_songs" && state.minTokenSongs < 12) {
      state.minTokenSongs = 12;
      elMinTokenSongsSlider.value = 12;
      elMinTokenSongsLabel.textContent = "12曲以上";
    } else if (presetKey === "lyrics_cooccur" && state.minTokenSongs > 8) {
      state.minTokenSongs = 5;
      elMinTokenSongsSlider.value = 5;
      elMinTokenSongsLabel.textContent = "5曲以上";
    }

    updatePresetTabUI();
    syncTypeCheckboxes();
    rebuildVisibleGraph(true);
    fitToView();
    if (!state.selectedNode) renderArtistOverview();
  }

  // =========================================================================
  // Graph Filtering, Dynamic Token Frequency & Intelligent Layout
  // =========================================================================
  function rebuildVisibleGraph(reheat = true) {
    if (!state.rawGraph) return;

    const presetCfg = PRESETS[state.preset] || {
      onlyConnectedSongs: false,
      onlyRelatedSongs: false,
      onlyCooccurrence: false,
    };
    const candidateNodes = new Map();

    // 1. Filter Song nodes by activity and year range
    const validSongIds = new Set();
    for (const n of state.nodeById.values()) {
      if (n.type === "Song") {
        const y = n.properties.release_year || state.dataYearMin;
        const act = n.properties.activity_type || "solo";
        if (state.enabledActivities.has(act) && y >= state.yearMin && y <= state.yearMax) {
          validSongIds.add(n.id);
        }
      }
    }

    // 2. Dynamically compute each Token's frequency & song_count within currently filtered songs!
    //    If year range or activity filter changes, node sizes react dynamically!
    const dynTokenFreq = new Map();
    const dynTokenSongs = new Map();
    const hasSongTokenEdges = state.allEdges.some((e) => e.type === "CONTAINS_TOKEN");
    if (hasSongTokenEdges) {
      for (const e of state.allEdges) {
        if (e.type !== "CONTAINS_TOKEN") continue;
        if (!validSongIds.has(e.source)) continue;
        dynTokenFreq.set(e.target, (dynTokenFreq.get(e.target) || 0) + (e.weight || 1));
        dynTokenSongs.set(e.target, (dynTokenSongs.get(e.target) || 0) + 1);
      }
    } else {
      // Standalone lyrics_knowledge_graph.json without Song nodes
      for (const n of state.nodeById.values()) {
        if (n.type === "Token") {
          dynTokenFreq.set(n.id, n.properties.total_frequency || 1);
          dynTokenSongs.set(n.id, n.properties.song_count || 1);
        }
      }
    }

    // 3. Build candidate node set
    if (state.egoRootId && state.nodeById.has(state.egoRootId)) {
      const root = state.nodeById.get(state.egoRootId);
      candidateNodes.set(root.id, root);
      const edges = state.adjacency.get(root.id) || [];
      for (const e of edges) {
        const otherId = e.source === root.id ? e.target : e.source;
        const other = state.nodeById.get(otherId);
        if (!other) continue;
        if (other.type === "Song" && !validSongIds.has(other.id)) continue;
        candidateNodes.set(other.id, other);
      }
      elEgoBanner.classList.remove("hidden");
      elEgoBannerText.textContent = `近傍モード: 「${root.label}」周辺のつながり`;
    } else {
      elEgoBanner.classList.add("hidden");

      if (presetCfg.onlyRelatedSongs) {
        for (const e of state.allEdges) {
          if (e.type !== "RELATED_SONG") continue;
          if (validSongIds.has(e.source) && validSongIds.has(e.target)) {
            candidateNodes.set(e.source, state.nodeById.get(e.source));
            candidateNodes.set(e.target, state.nodeById.get(e.target));
          }
        }
      } else {
        for (const n of state.nodeById.values()) {
          if (!state.enabledTypes.has(n.type)) continue;
          if (n.type === "Song") {
            if (validSongIds.has(n.id)) candidateNodes.set(n.id, n);
          } else if (n.type === "Token") {
            const cat = n.properties.category || "その他";
            const sc = dynTokenSongs.get(n.id) || 0;
            if (state.enabledTokenCategories.has(cat) && sc >= state.minTokenSongs) {
              candidateNodes.set(n.id, n);
            }
          } else {
            candidateNodes.set(n.id, n);
          }
        }
      }
    }

    // 4. Collect visible edges
    let visibleEdges = [];
    for (const e of state.allEdges) {
      if (presetCfg.onlyRelatedSongs && !state.egoRootId && e.type !== "RELATED_SONG") continue;
      if (presetCfg.onlyCooccurrence && !state.egoRootId && e.type !== "CO_OCCURS_WITH") continue;
      if (state.preset === "lyrics_songs" && !state.egoRootId && e.type === "CO_OCCURS_WITH") continue;
      if (candidateNodes.has(e.source) && candidateNodes.has(e.target)) {
        if (
          state.preset === "artists" &&
          !state.egoRootId &&
          e.type === "LYRICIST_OF" &&
          e.source === state.rawGraph.meta.artist_id
        ) {
          continue;
        }
        visibleEdges.push(e);
      }
    }

    // 5. Prune isolated non-song nodes (keep tokens in cooccurrence mode even if singletons when minTokenSongs is high)
    const connectedIds = new Set();
    for (const e of visibleEdges) {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
    }

    const finalNodes = [];
    const finalMap = new Map();
    for (const n of candidateNodes.values()) {
      if (n.id === state.egoRootId) {
        finalNodes.push(n);
        finalMap.set(n.id, n);
        continue;
      }
      if (n.type === "Token" && presetCfg.onlyCooccurrence) {
        finalNodes.push(n);
        finalMap.set(n.id, n);
        continue;
      }
      if (n.type !== "Song" && !connectedIds.has(n.id)) continue;
      if (presetCfg.onlyConnectedSongs && !state.egoRootId && n.type === "Song" && !connectedIds.has(n.id)) continue;
      finalNodes.push(n);
      finalMap.set(n.id, n);
    }

    visibleEdges = visibleEdges.filter((e) => finalMap.has(e.source) && finalMap.has(e.target));

    // Build visible adjacency & dynamic frequency sizing
    const visAdj = new Map();
    for (const n of finalNodes) visAdj.set(n.id, new Set());
    for (const e of visibleEdges) {
      visAdj.get(e.source).add(e.target);
      visAdj.get(e.target).add(e.source);
    }

    // Determine max dynamic token frequency for smooth radius scaling
    let maxTokFreq = 1;
    for (const n of finalNodes) {
      if (n.type === "Token") {
        const f = dynTokenFreq.get(n.id) || n.properties.total_frequency || 1;
        n.dynFreq = f;
        n.dynSongCount = dynTokenSongs.get(n.id) || n.properties.song_count || 1;
        if (f > maxTokFreq) maxTokFreq = f;
      }
    }

    // Compute visual radius: frequent lyric tokens become prominently larger!
    let visMinR = Infinity;
    let visMaxR = -Infinity;
    for (const n of finalNodes) {
      const deg = visAdj.get(n.id).size;
      n.visDegree = deg;
      const base = (NODE_TYPE_META[n.type] || NODE_TYPE_META.Song).radiusBase;
      if (n.type === "Token") {
        const norm = Math.sqrt((n.dynFreq || 1) / maxTokFreq); // sqrt keeps area ~ proportional to frequency
        const maxR = presetCfg.onlyCooccurrence ? 44 : 32;
        const minR = presetCfg.onlyCooccurrence ? 7.5 : 7;
        n.radius = minR + norm * (maxR - minR);
      } else if (n.type === "Song") {
        n.radius = base + Math.min(5, Math.sqrt(deg) * 1.1);
      } else {
        n.radius = Math.min(28, base + Math.sqrt(deg) * 1.9);
      }
      if (n.radius < visMinR) visMinR = n.radius;
      if (n.radius > visMaxR) visMaxR = n.radius;
    }
    state.visMinRadius = Number.isFinite(visMinR) ? visMinR : 6;
    state.visMaxRadius = Number.isFinite(visMaxR) ? visMaxR : 44;

    // Intelligent initial placement
    if (reheat) {
      if (presetCfg.onlyCooccurrence && !state.egoRootId) {
        // Place most frequent tokens near center, rarer tokens in outer spiral grouped by category
        const catOrder = Object.keys(TOKEN_CATEGORY_META);
        const sortedToks = [...finalNodes].sort((a, b) => (b.dynFreq || 0) - (a.dynFreq || 0));
        sortedToks.forEach((t, idx) => {
          if (t.fx != null && t.fy != null) return;
          const catIdx = Math.max(0, catOrder.indexOf(t.properties.category || ""));
          const sectorAngle = (catIdx / Math.max(1, catOrder.length)) * Math.PI * 2;
          const spread = ((idx % 13) - 6) * 0.14;
          const r = idx === 0 ? 0 : 65 + Math.sqrt(idx) * 58;
          t.x = Math.cos(sectorAngle + spread) * r;
          t.y = Math.sin(sectorAngle + spread) * r;
          t.vx = 0;
          t.vy = 0;
        });
      } else {
        const hubs = finalNodes.filter((n) => n.type !== "Song");
        const songs = finalNodes.filter((n) => n.type === "Song");

        if (hubs.length > 0) {
          const ringR = Math.max(220, Math.min(560, hubs.length * 14));
          hubs.forEach((h, i) => {
            if (h.fx != null && h.fy != null) return;
            const angle = (i / hubs.length) * Math.PI * 2;
            const r = h.id === state.egoRootId ? 0 : ringR * (0.72 + (i % 3) * 0.15);
            h.x = Math.cos(angle) * r;
            h.y = Math.sin(angle) * r;
            h.vx = 0;
            h.vy = 0;
          });

          songs.forEach((s, i) => {
            if (s.fx != null && s.fy != null) return;
            const neighbors = Array.from(visAdj.get(s.id) || [])
              .map((id) => finalMap.get(id))
              .filter((nb) => nb && nb.type !== "Song");
            if (neighbors.length > 0) {
              let ax = 0, ay = 0;
              for (const nb of neighbors) { ax += nb.x; ay += nb.y; }
              ax /= neighbors.length;
              ay /= neighbors.length;
              const jitterA = (i * 2.39996) % (Math.PI * 2);
              const jitterR = 40 + (i % 7) * 14;
              s.x = ax + Math.cos(jitterA) * jitterR;
              s.y = ay + Math.sin(jitterA) * jitterR;
            } else {
              const angle = (i / Math.max(1, songs.length)) * Math.PI * 2;
              const r = ringR * 1.25;
              s.x = Math.cos(angle) * r;
              s.y = Math.sin(angle) * r;
            }
            s.vx = 0;
            s.vy = 0;
          });
        } else {
          const ringR = Math.max(180, Math.min(420, songs.length * 9));
          songs.forEach((s, i) => {
            if (s.fx != null && s.fy != null) return;
            const angle = (i / Math.max(1, songs.length)) * Math.PI * 2;
            s.x = Math.cos(angle) * ringR;
            s.y = Math.sin(angle) * ringR;
            s.vx = 0;
            s.vy = 0;
          });
        }
      }
      state.alpha = 1.0;
    }

    state.nodes = finalNodes;
    state.edges = visibleEdges;
    state.visibleNodeMap = finalMap;
    state.visibleAdj = visAdj;

    // Pre-settle layout synchronously and strictly eliminate all node & label overlaps, then lock in place
    if (reheat) {
      computeStaticNonOverlappingLayout(170, 110);
    } else {
      resolveOverlaps(80);
    }

    // Update HUD stats
    const visSongCount = finalNodes.filter((n) => n.type === "Song").length;
    elHudNodes.textContent = finalNodes.length;
    elHudEdges.textContent = visibleEdges.length;
    elHudSongs.textContent = state.preset === "lyrics_cooccur" ? validSongIds.size : visSongCount;
  }

  // =========================================================================
  // Static Non-Overlapping Layout & Optional Force Physics Engine
  // =========================================================================
  function getNodeFootprint(n) {
    const spacingScale = state.repulsion / 220; // user-adjustable spacing
    const pad = Math.max(8, 12 * spacingScale);
    const drawInside = n.type === "Token" && n.radius >= 17 && n.label.length <= 4;
    if (drawInside) {
      return { rx: n.radius + pad, ry: n.radius + pad };
    }
    const isHub = n.type !== "Song";
    const labelCharW = isHub ? 6.4 : 5.4;
    const labelHalfW = Math.min(isHub ? 74 : 56, (n.label.length * labelCharW) / 2 + 6);
    const labelSpaceY = isHub ? 18 : 13;
    return {
      rx: Math.max(n.radius + pad, labelHalfW * Math.min(1.2, spacingScale)),
      ry: n.radius + pad + labelSpaceY,
    };
  }

  function resolveOverlaps(maxIterations = 100) {
    const nodes = state.nodes;
    const nLen = nodes.length;
    if (nLen <= 1) return;

    const footprints = nodes.map((n) => getNodeFootprint(n));

    for (let iter = 0; iter < maxIterations; iter++) {
      let movedAny = false;
      for (let i = 0; i < nLen; i++) {
        const a = nodes[i];
        const fa = footprints[i];
        const aFixed = a.fx != null && a.fy != null;
        for (let j = i + 1; j < nLen; j++) {
          const b = nodes[j];
          const fb = footprints[j];
          const bFixed = b.fx != null && b.fy != null;
          if (aFixed && bFixed) continue;

          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const minDx = fa.rx + fb.rx;
          const minDy = fa.ry + fb.ry;

          // Quick AABB reject
          if (Math.abs(dx) >= minDx || Math.abs(dy) >= minDy) continue;

          // Elliptical overlap test for smooth organic packing without corners
          const nx = dx / minDx;
          const ny = dy / minDy;
          const ellipDistSq = nx * nx + ny * ny;
          if (ellipDistSq >= 1.0) continue;

          movedAny = true;
          let ellipDist = Math.sqrt(ellipDistSq);
          if (ellipDist < 0.0001) {
            // Break exact coincidence deterministically
            const angle = ((i * 73 + j * 37) % 360) * (Math.PI / 180);
            dx = Math.cos(angle) * 0.5;
            dy = Math.sin(angle) * 0.5;
            ellipDist = 0.01;
          }

          const pushScale = (1.02 - ellipDist) / ellipDist;
          const pushX = dx * pushScale * 0.52;
          const pushY = dy * pushScale * 0.52;

          // Heavier/larger nodes move slightly less so hub structure stays anchored
          const wa = aFixed ? 0 : 1 / (a.radius + 8);
          const wb = bFixed ? 0 : 1 / (b.radius + 8);
          const wSum = wa + wb || 1;
          const ra = wa / wSum;
          const rb = wb / wSum;

          a.x -= pushX * ra * 2;
          a.y -= pushY * ra * 2;
          b.x += pushX * rb * 2;
          b.y += pushY * rb * 2;
        }
      }
      if (!movedAny) break;
    }

    for (let i = 0; i < nLen; i++) {
      nodes[i].vx = 0;
      nodes[i].vy = 0;
    }
  }

  function computeStaticNonOverlappingLayout(physicsSteps = 160, overlapSteps = 110) {
    if (state.nodes.length === 0) return;
    let simAlpha = 1.0;
    for (let step = 0; step < physicsSteps; step++) {
      runPhysicsStep(simAlpha);
      simAlpha *= 0.982;
      if (simAlpha < 0.03) break;
    }
    resolveOverlaps(overlapSteps);
    state.alpha = 0;
  }

  function runPhysicsStep(alpha) {
    const nodes = state.nodes;
    const edges = state.edges;
    const nLen = nodes.length;
    if (nLen === 0) return;

    const isTokenOnly = state.preset === "lyrics_cooccur" && !state.egoRootId;
    const repulsion = state.repulsion * (isTokenOnly ? 30 : 18);
    const linkStrength = isTokenOnly ? 0.032 : 0.042;
    const gravity = isTokenOnly ? 0.022 : 0.016;
    const damping = 0.80;

    // 1. Pairwise Repulsion + Radius-Aware Collision Avoidance
    for (let i = 0; i < nLen; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nLen; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy + 0.01;
        if (distSq > 1400000) continue;

        const dist = Math.sqrt(distSq);
        const minDist = a.radius + b.radius + (isTokenOnly ? 26 : 22);
        const sizeFactor =
          isTokenOnly
            ? (0.65 + a.radius / 20) * (0.65 + b.radius / 20)
            : (a.type !== "Song" ? 1.8 : 1.0) * (b.type !== "Song" ? 1.8 : 1.0);
        let force = (repulsion * sizeFactor) / distSq;

        if (dist < minDist) {
          force += (minDist - dist) * 0.55;
        }

        const fx = (dx / dist) * force * alpha;
        const fy = (dy / dist) * force * alpha;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // 2. Spring Attraction along Edges
    const map = state.visibleNodeMap;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const s = map.get(e.source);
      const t = map.get(e.target);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;

      let targetLen = s.radius + t.radius + 92;
      let k = linkStrength;
      if (e.type === "RELATED_SONG") {
        targetLen = 135;
      } else if (e.type === "CO_OCCURS_WITH") {
        const w = e.weight || 2;
        targetLen = Math.max(s.radius + t.radius + 54, 210 - Math.min(95, Math.sqrt(w) * 12));
        k = linkStrength * (0.55 + Math.min(1.6, w / 28));
      }

      const diff = (dist - targetLen) * k * alpha;
      const fx = (dx / dist) * diff;
      const fy = (dy / dist) * diff;
      s.vx += fx;
      s.vy += fy;
      t.vx -= fx;
      t.vy -= fy;
    }

    // 3. Center Gravity & Integration
    for (let i = 0; i < nLen; i++) {
      const n = nodes[i];
      if (n.fx != null && n.fy != null) {
        n.x = n.fx;
        n.y = n.fy;
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      const gPull = n.type === "Token" ? gravity * (0.75 + n.radius / 42) : gravity;
      n.vx -= n.x * gPull * alpha;
      n.vy -= n.y * gPull * alpha;
      n.vx *= damping;
      n.vy *= damping;

      const maxV = 34;
      const vMag = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (vMag > maxV) {
        n.vx = (n.vx / vMag) * maxV;
        n.vy = (n.vy / vMag) * maxV;
      }

      n.x += n.vx;
      n.y += n.vy;
    }
  }

  function stepSimulation() {
    if (!state.running || state.alpha < 0.008) return;
    runPhysicsStep(state.alpha);
    resolveOverlaps(2);
    state.alpha *= 0.985;
  }

  // =========================================================================
  // Rendering (High-DPI Canvas 2D)
  // =========================================================================
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = stage.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function screenToWorld(sx, sy) {
    const rect = stage.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    return {
      x: (sx - cx) / state.zoom + state.camX,
      y: (sy - cy) / state.zoom + state.camY,
    };
  }

  function updateCameraAnimation() {
    if (!state.targetCam) return;
    const lerp = 0.14;
    state.camX += (state.targetCam.x - state.camX) * lerp;
    state.camY += (state.targetCam.y - state.camY) * lerp;
    state.zoom += (state.targetCam.zoom - state.zoom) * lerp;
    if (
      Math.abs(state.targetCam.x - state.camX) < 0.4 &&
      Math.abs(state.targetCam.y - state.camY) < 0.4 &&
      Math.abs(state.targetCam.zoom - state.zoom) < 0.005
    ) {
      state.camX = state.targetCam.x;
      state.camY = state.targetCam.y;
      state.zoom = state.targetCam.zoom;
      state.targetCam = null;
    }
  }

  // 5-tier mineral pigment color scale strictly mapped by node radius (small -> large)
  function getColorBySizeRatio(t) {
    if (t >= 0.76) return "#c93b33"; // 特大: 深緋 (Vermilion Lacquer)
    if (t >= 0.54) return "#d6743e"; // 大:   代赭 (Burnt Ochre)
    if (t >= 0.34) return "#cca343"; // 中:   黄土 (Gold Ochre)
    if (t >= 0.16) return "#568f87"; // 小:   青磁 (Celadon)
    return "#5e708a";                // 極小: 藍鼠 (Indigo Slate)
  }

  function getNodeColor(n) {
    const r = typeof n.radius === "number" ? n.radius : (NODE_TYPE_META[n.type] || NODE_TYPE_META.Song).radiusBase;
    const span = state.visMaxRadius - state.visMinRadius;
    const t = span > 0.5 ? Math.max(0, Math.min(1, (r - state.visMinRadius) / span)) : 0.45;
    return getColorBySizeRatio(t);
  }

  function render() {
    const rect = stage.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Warm matte sumi-black fill
    ctx.fillStyle = "#121110";
    ctx.fillRect(0, 0, w, h);
    drawGrid(w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(state.zoom, state.zoom);
    ctx.translate(-state.camX, -state.camY);

    const activeFocus = state.hoveredNode || state.selectedNode;
    const focusNeighbors = activeFocus ? state.visibleAdj.get(activeFocus.id) || new Set() : null;
    const map = state.visibleNodeMap;

    // 1. Draw Edges (Fine drafting lines on dark ground)
    for (let i = 0; i < state.edges.length; i++) {
      const e = state.edges[i];
      const s = map.get(e.source);
      const t = map.get(e.target);
      if (!s || !t) continue;

      const isRelated = e.type === "RELATED_SONG";
      const isCooccur = e.type === "CO_OCCURS_WITH";
      const isHighlighted =
        activeFocus && (e.source === activeFocus.id || e.target === activeFocus.id);

      ctx.beginPath();
      if (isRelated) {
        ctx.setLineDash([5 / state.zoom, 3.5 / state.zoom]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);

      const coStrength = isCooccur ? Math.min(1, (e.weight || 1) / 22) : 0;

      if (isHighlighted) {
        ctx.strokeStyle = isRelated ? "#d6743e" : "#eae5dc";
        const baseW = isCooccur ? 1.3 + coStrength * 3.2 : isRelated ? 2.0 : 1.5;
        ctx.lineWidth = baseW / Math.sqrt(state.zoom);
      } else if (activeFocus) {
        ctx.strokeStyle = "rgba(168, 161, 150, 0.04)";
        ctx.lineWidth = 0.6 / Math.sqrt(state.zoom);
      } else if (isRelated) {
        ctx.strokeStyle = "rgba(214, 116, 62, 0.68)";
        ctx.lineWidth = 1.4 / Math.sqrt(state.zoom);
      } else if (isCooccur) {
        const a = Math.min(0.55, state.edgeAlpha * 0.75 + coStrength * 0.36);
        ctx.strokeStyle = `rgba(186, 179, 166, ${a})`;
        ctx.lineWidth = (0.65 + coStrength * 2.8) / Math.sqrt(state.zoom);
      } else {
        ctx.strokeStyle = `rgba(186, 179, 166, ${state.edgeAlpha})`;
        ctx.lineWidth = 0.75 / Math.sqrt(state.zoom);
      }
      ctx.stroke();

      // Edge annotation for RELATED_SONG or highlighted CO_OCCURS_WITH
      if (isRelated && (isHighlighted || state.preset === "relations") && state.zoom > 0.55) {
        const mx = (s.x + t.x) / 2;
        const my = (s.y + t.y) / 2;
        const relTag = (e.properties && e.properties.relation) || "";
        const shortLabel =
          relTag === "SYMMETRY_PAIR" ? "対称" :
          relTag === "SELF_REMAKE" ? "再構築" :
          relTag === "PROTOTYPE_OF" ? "原曲" :
          relTag === "SERIES_PAIR" ? "連作" :
          relTag === "MOTIF_LINEAGE" ? "系譜" : "対";
        ctx.save();
        ctx.setLineDash([]);
        const fs = Math.max(8, 9.5 / Math.sqrt(state.zoom));
        ctx.font = `600 ${fs}px "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const tw = ctx.measureText(shortLabel).width + 6 / state.zoom;
        ctx.fillStyle = "#181715";
        ctx.fillRect(mx - tw / 2, my - fs * 0.65, tw, fs * 1.3);
        ctx.fillStyle = "#d6743e";
        ctx.fillText(shortLabel, mx, my);
        ctx.restore();
      } else if (isCooccur && isHighlighted && state.zoom > 0.55 && (e.weight || 0) >= 3) {
        const mx = (s.x + t.x) / 2;
        const my = (s.y + t.y) / 2;
        const txt = `${Math.round(e.weight)}曲`;
        ctx.save();
        const fs = Math.max(8, 9.5 / Math.sqrt(state.zoom));
        ctx.font = `600 ${fs}px "JetBrains Mono", Consolas, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const tw = ctx.measureText(txt).width + 6 / state.zoom;
        ctx.fillStyle = "#181715";
        ctx.fillRect(mx - tw / 2, my - fs * 0.65, tw, fs * 1.3);
        ctx.fillStyle = "#eae5dc";
        ctx.fillText(txt, mx, my);
        ctx.restore();
      }
    }
    ctx.setLineDash([]);

    // 2. Draw Nodes (Flat mineral pigment + crisp dark borders + technical compass rings)
    const sortedNodes = [...state.nodes].sort((a, b) => {
      const pa = (NODE_TYPE_META[a.type] || NODE_TYPE_META.Song).priority;
      const pb = (NODE_TYPE_META[b.type] || NODE_TYPE_META.Song).priority;
      if (pa !== pb) return pa - pb;
      return (a.radius || 0) - (b.radius || 0);
    });

    for (let i = 0; i < sortedNodes.length; i++) {
      const n = sortedNodes[i];
      const fillColor = getNodeColor(n);

      const isSelected = state.selectedNode && state.selectedNode.id === n.id;
      const isHovered = state.hoveredNode && state.hoveredNode.id === n.id;
      const isNeighbor = focusNeighbors && focusNeighbors.has(n.id);
      const isDimmed = activeFocus && !isSelected && !isHovered && !isNeighbor;

      ctx.save();
      ctx.globalAlpha = isDimmed ? 0.15 : 1.0;

      // Technical drafting reticle ring on selected or hovered node (no neon blur!)
      if (isSelected || isHovered) {
        const outerR = n.radius + 4.5 / Math.sqrt(state.zoom);
        ctx.beginPath();
        ctx.arc(n.x, n.y, outerR, 0, Math.PI * 2);
        ctx.lineWidth = (isSelected ? 1.5 : 1.1) / Math.sqrt(state.zoom);
        ctx.strokeStyle = isSelected ? "#eae5dc" : "#a8a196";
        ctx.stroke();

        // Crosshair ticks at 4 cardinal points
        const tickLen = 3.5 / Math.sqrt(state.zoom);
        ctx.beginPath();
        ctx.moveTo(n.x - outerR - tickLen, n.y); ctx.lineTo(n.x - outerR, n.y);
        ctx.moveTo(n.x + outerR, n.y);          ctx.lineTo(n.x + outerR + tickLen, n.y);
        ctx.moveTo(n.x, n.y - outerR - tickLen); ctx.lineTo(n.x, n.y - outerR);
        ctx.moveTo(n.x, n.y + outerR);          ctx.lineTo(n.x, n.y + outerR + tickLen);
        ctx.stroke();
      }

      // Main solid pigment disc
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Crisp border outline
      ctx.lineWidth = (isSelected ? 1.8 : 1.1) / Math.sqrt(state.zoom);
      ctx.strokeStyle = isSelected ? "#eae5dc" : "#0b0a09";
      ctx.stroke();

      // Fine inset print ring on large nodes (r >= 17)
      if (n.radius >= 17) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius - 2.4 / Math.sqrt(state.zoom), 0, Math.PI * 2);
        ctx.lineWidth = 0.7 / Math.sqrt(state.zoom);
        ctx.strokeStyle = "rgba(234, 229, 220, 0.42)";
        ctx.stroke();
      }

      ctx.restore();
    }

    // 3. Draw Typography Labels (Editorial Serif on dark sumi ground)
    for (let i = 0; i < sortedNodes.length; i++) {
      const n = sortedNodes[i];
      const isSelected = state.selectedNode && state.selectedNode.id === n.id;
      const isHovered = state.hoveredNode && state.hoveredNode.id === n.id;
      const isNeighbor = focusNeighbors && focusNeighbors.has(n.id);
      const isDimmed = activeFocus && !isSelected && !isHovered && !isNeighbor;
      if (isDimmed) continue;

      let showLabel = false;
      if (isSelected || isHovered || isNeighbor) {
        showLabel = true;
      } else if (state.labelMode === "all") {
        showLabel = true;
      } else if (state.labelMode === "hubs") {
        showLabel = n.type !== "Song" || state.preset === "relations";
      } else {
        if (n.type === "Token") {
          showLabel = n.radius >= 14 || state.zoom > 0.62;
        } else if (n.type !== "Song") {
          showLabel = state.zoom > 0.32;
        } else if (state.preset === "relations" || state.egoRootId) {
          showLabel = state.zoom > 0.45;
        } else {
          showLabel = state.zoom > 1.18;
        }
      }

      if (!showLabel) continue;

      const isHub = n.type !== "Song";
      const drawInside = n.type === "Token" && n.radius >= 17 && n.label.length <= 4;

      if (drawInside) {
        const innerFont = Math.max(9.5, Math.min(18.5, n.radius * (n.label.length <= 2 ? 0.62 : 0.45)));
        ctx.font = `700 ${innerFont}px "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const yOff = n.radius >= 26 ? -3.5 : 0;
        ctx.fillStyle = "#f7f4ec";
        ctx.fillText(n.label, n.x, n.y + yOff);

        if (n.radius >= 26) {
          const subFont = Math.max(7.5, innerFont * 0.45);
          ctx.font = `600 ${subFont}px "JetBrains Mono", Consolas, monospace`;
          ctx.fillStyle = "rgba(247, 244, 236, 0.88)";
          ctx.fillText(`${n.dynSongCount || n.properties.song_count || 0}曲`, n.x, n.y + innerFont * 0.56);
        }
      } else {
        const fontSize = Math.max(9, (isHub ? 11.5 : 10.2) / Math.pow(state.zoom, 0.35));
        ctx.font = `${isHub || isSelected ? "700" : "600"} ${fontSize}px "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const ty = n.y + n.radius + 3.5 / Math.sqrt(state.zoom);

        // Dark archival slip plate behind exterior labels
        const textW = ctx.measureText(n.label).width;
        const padX = 3 / Math.sqrt(state.zoom);
        const padY = 1.2 / Math.sqrt(state.zoom);
        ctx.fillStyle = isSelected ? "#eae5dc" : "rgba(18, 17, 16, 0.86)";
        ctx.fillRect(n.x - textW / 2 - padX, ty - padY, textW + padX * 2, fontSize + padY * 2);

        ctx.fillStyle = isSelected ? "#121110" : "#eae5dc";
        ctx.fillText(n.label, n.x, ty);
      }
    }

    ctx.restore();
  }

  function drawGrid(w, h) {
    const spacing = 72 * state.zoom;
    if (spacing < 22) return;
    const ox = (w / 2 - state.camX * state.zoom) % spacing;
    const oy = (h / 2 - state.camY * state.zoom) % spacing;
    ctx.strokeStyle = "rgba(234, 229, 220, 0.035)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let x = ox; x < w; x += spacing) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = oy; y < h; y += spacing) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  }

  function tick() {
    stepSimulation();
    updateCameraAnimation();
    render();
    requestAnimationFrame(tick);
  }

  // =========================================================================
  // Camera Helpers
  // =========================================================================
  function fitToView() {
    if (state.nodes.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of state.nodes) {
      minX = Math.min(minX, n.x - n.radius);
      maxX = Math.max(maxX, n.x + n.radius);
      minY = Math.min(minY, n.y - n.radius);
      maxY = Math.max(maxY, n.y + n.radius);
    }
    const rect = stage.getBoundingClientRect();
    const pad = 90;
    const gw = Math.max(120, maxX - minX);
    const gh = Math.max(120, maxY - minY);
    const zoom = Math.min(1.5, Math.max(0.24, Math.min((rect.width - pad) / gw, (rect.height - pad) / gh)));
    state.targetCam = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      zoom,
    };
  }

  function focusNodeById(nodeId) {
    const rawNode = state.nodeById.get(nodeId);
    if (!rawNode) return;

    if (!state.visibleNodeMap.has(nodeId)) {
      if (state.egoRootId) state.egoRootId = null;

      if (rawNode.type === "Token") {
        // Lower minTokenSongs if needed and ensure category is enabled
        const sc = rawNode.properties.song_count || 1;
        if (sc < state.minTokenSongs) {
          state.minTokenSongs = Math.max(1, sc);
          elMinTokenSongsSlider.value = state.minTokenSongs;
          elMinTokenSongsLabel.textContent = `${state.minTokenSongs}曲以上`;
        }
        if (rawNode.properties.category) {
          state.enabledTokenCategories.add(rawNode.properties.category);
          elTokenCategoryFilters.querySelectorAll("input").forEach((cb) => {
            cb.checked = state.enabledTokenCategories.has(cb.dataset.tokenCat);
          });
        }
        if (state.preset !== "lyrics_cooccur" && state.preset !== "lyrics_songs") {
          state.preset = "lyrics_cooccur";
          state.enabledTypes = new Set(["Token"]);
          updatePresetTabUI();
        }
      } else {
        if (state.preset === "lyrics_cooccur" || (state.preset === "relations" && rawNode.type !== "Song")) {
          state.preset = rawNode.type === "Song" ? "lyrics_songs" : "all";
          state.enabledTypes = new Set(PRESETS[state.preset].types);
          updatePresetTabUI();
        }
        state.enabledTypes.add(rawNode.type);
        if (rawNode.type === "Song") {
          state.enabledActivities.add(rawNode.properties.activity_type || "solo");
          const y = rawNode.properties.release_year;
          if (y && y < state.yearMin) { state.yearMin = y; elYearMin.value = y; }
          if (y && y > state.yearMax) { state.yearMax = y; elYearMax.value = y; }
          elYearRangeLabel.textContent = `${state.yearMin} – ${state.yearMax}`;
          elActivityFilters.querySelectorAll("input").forEach((cb) => {
            cb.checked = state.enabledActivities.has(cb.dataset.activity);
          });
        }
      }

      syncTypeCheckboxes();
      rebuildVisibleGraph(true);
    }

    const visNode = state.visibleNodeMap.get(nodeId);
    if (visNode) {
      selectNode(visNode);
      state.targetCam = {
        x: visNode.x,
        y: visNode.y,
        zoom: Math.max(state.zoom, 1.25),
      };
    }
  }

  function enterEgoMode(nodeId) {
    state.egoRootId = nodeId;
    rebuildVisibleGraph(true);
    const vis = state.visibleNodeMap.get(nodeId);
    if (vis) selectNode(vis);
    setTimeout(fitToView, 120);
  }

  // =========================================================================
  // Hit Testing & Tooltip
  // =========================================================================
  function findNodeAt(sx, sy, isTouch = false) {
    const w = screenToWorld(sx, sy);
    // Keep hit area close to the visible node circle so tapping empty space reliably clears selection
    const padPx = isTouch ? 5 : 3;
    let bestNode = null;
    let bestDistSq = Infinity;

    for (let i = state.nodes.length - 1; i >= 0; i--) {
      const n = state.nodes[i];
      const hitR = n.radius + padPx / Math.max(0.45, state.zoom);
      const dx = w.x - n.x;
      const dy = w.y - n.y;
      const dSq = dx * dx + dy * dy;
      if (dSq <= hitR * hitR) {
        if (dSq <= n.radius * n.radius) {
          return n;
        }
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestNode = n;
        }
      }
    }
    return bestNode;
  }

  function showTooltip(node, sx, sy) {
    if (!node) {
      elTooltip.classList.add("hidden");
      return;
    }
    const meta = NODE_TYPE_META[node.type] || { label: node.type };
    let sub = `${meta.label} · 接続数 ${node.visDegree || 0}`;
    if (node.type === "Song") {
      sub = `${node.properties.release_year}年 · ${node.properties.performer} · ${node.properties.activity_label}`;
    } else if (node.type === "Token") {
      const sc = node.dynSongCount ?? node.properties.song_count ?? 0;
      const freq = node.dynFreq ?? node.properties.total_frequency ?? 0;
      sub = `歌詞ワード [${node.properties.category || ""}] · ${sc}曲に登場 (計${freq}回出現)`;
    }
    elTooltip.innerHTML = `
      <div class="tooltip-title">${escapeHtml(node.label)}</div>
      <div class="tooltip-meta">${escapeHtml(sub)}</div>
    `;
    const rect = stage.getBoundingClientRect();
    const left = Math.min(rect.width - 270, sx + 14);
    const top = Math.min(rect.height - 70, sy + 14);
    elTooltip.style.left = `${Math.max(8, left)}px`;
    elTooltip.style.top = `${Math.max(8, top)}px`;
    elTooltip.classList.remove("hidden");
  }

  // =========================================================================
  // Custom Year-Interval Distribution Widget
  // =========================================================================
  function buildDistributionHtml(title) {
    const step = state.distStepYears;
    const isEra = state.distMode === "era";
    const quickSteps = [1, 2, 3, 5, 10];
    const presetBtns = quickSteps
      .map(
        (k) =>
          `<button type="button" class="dist-preset-btn ${!isEra && step === k ? "active" : ""}" data-dist-step="${k}">${k}年</button>`
      )
      .join("");

    return `
      <div class="detail-card" id="distCard">
        <div class="section-header" style="margin-bottom:6px;">
          <h4>${escapeHtml(title)}</h4>
          <span class="hint-text" style="margin:0;font-size:10px;">区間クリックで年代絞り込み</span>
        </div>
        <div class="dist-controls">
          <div class="dist-presets">
            ${presetBtns}
            <button type="button" class="dist-preset-btn ${isEra ? "active" : ""}" data-dist-era="1">活動期</button>
          </div>
          <label class="dist-custom-input" title="任意の年数区間（1〜30年）を指定">
            <span>任意</span>
            <input type="number" id="distCustomYearsInput" min="1" max="30" value="${step}" />
            <span>年刻み</span>
          </label>
        </div>
        <div id="distBarsBody" class="dist-bars-container"></div>
      </div>
    `;
  }

  function mountDistributionWidget(songEntries, barColor, isWeightedToken = false) {
    const card = document.getElementById("distCard");
    const body = document.getElementById("distBarsBody");
    const customInput = document.getElementById("distCustomYearsInput");
    if (!card || !body) return;

    const renderBars = () => {
      const isEra = state.distMode === "era";
      const step = Math.max(1, Math.min(30, parseInt(state.distStepYears, 10) || 3));

      // Update active button classes
      card.querySelectorAll(".dist-preset-btn").forEach((btn) => {
        if (btn.dataset.distEra) {
          btn.classList.toggle("active", isEra);
        } else {
          const bStep = parseInt(btn.dataset.distStep, 10);
          btn.classList.toggle("active", !isEra && bStep === step);
        }
      });

      if (isEra) {
        // Group by era
        const eraMap = new Map();
        const erasList = (state.artistProfile && state.artistProfile.eras) || [];
        for (const er of erasList) eraMap.set(er.label, { label: er.label, freq: 0, songs: 0, period: er.period });
        for (const item of songEntries) {
          const eraName = item.node.properties.era || "その他";
          if (!eraMap.has(eraName)) eraMap.set(eraName, { label: eraName, freq: 0, songs: 0, period: null });
          const rec = eraMap.get(eraName);
          rec.freq += item.weight || 1;
          rec.songs += 1;
        }
        const bins = Array.from(eraMap.values()).filter((b) => b.songs > 0 || erasList.length > 0);
        const maxVal = Math.max(1, ...bins.map((b) => (isWeightedToken ? b.freq : b.songs)));

        body.innerHTML = bins
          .map((b) => {
            const val = isWeightedToken ? Math.round(b.freq) : b.songs;
            const subTxt = isWeightedToken ? `${val}回 (${b.songs}曲)` : `${b.songs}曲`;
            return `
              <div class="mini-bar-row" data-bin-period="${escapeHtml(b.period || "")}" title="${escapeHtml(b.label)}: ${subTxt}">
                <div class="mini-bar-label">${escapeHtml(b.label.split(" ")[0])}</div>
                <div class="bar-track"><div class="bar-fill" style="width:${(val / maxVal) * 100}%;background:${barColor}"></div></div>
                <div class="bar-val">${isWeightedToken ? `${val}回` : `${b.songs}曲`}</div>
              </div>`;
          })
          .join("");

        body.querySelectorAll(".mini-bar-row[data-bin-period]").forEach((row) => {
          const per = row.dataset.binPeriod;
          if (!per || !per.includes("-")) return;
          row.addEventListener("click", () => {
            const [y1, y2] = per.split("-").map((x) => parseInt(x, 10));
            toggleYearFilterRange(y1, y2, renderBars);
          });
        });
        return;
      }

      // Custom N-year interval bins across [dataYearMin, dataYearMax]
      const minY = state.dataYearMin;
      const maxY = state.dataYearMax;
      const bins = [];
      for (let y = minY; y <= maxY; y += step) {
        const yEnd = Math.min(maxY, y + step - 1);
        const label = y === yEnd ? `${y}` : `${y}–${yEnd}`;
        bins.push({ yStart: y, yEnd, label, freq: 0, songs: 0 });
      }

      for (const item of songEntries) {
        const ry = item.node.properties.release_year;
        if (!ry || ry < minY || ry > maxY) continue;
        const idx = Math.min(bins.length - 1, Math.floor((ry - minY) / step));
        bins[idx].freq += item.weight || 1;
        bins[idx].songs += 1;
      }

      const maxVal = Math.max(1, ...bins.map((b) => (isWeightedToken ? b.freq : b.songs)));

      body.innerHTML = bins
        .map((b) => {
          const val = isWeightedToken ? Math.round(b.freq) : b.songs;
          const isCurrentFilter =
            (state.yearMin !== state.dataYearMin || state.yearMax !== state.dataYearMax) &&
            state.yearMin === b.yStart &&
            state.yearMax === b.yEnd;
          const subTxt = isWeightedToken ? `${val}回 (${b.songs}曲)` : `${b.songs}曲`;
          return `
            <div class="mini-bar-row ${isCurrentFilter ? "active-bin" : ""}" data-y-start="${b.yStart}" data-y-end="${b.yEnd}" title="${b.label}年: ${subTxt}（クリックでこの期間に絞り込み）">
              <div class="mini-bar-label">${b.label}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${(val / maxVal) * 100}%;background:${barColor}"></div></div>
              <div class="bar-val">${isWeightedToken ? `${val}回` : `${b.songs}曲`}</div>
            </div>`;
        })
        .join("");

      body.querySelectorAll(".mini-bar-row[data-y-start]").forEach((row) => {
        row.addEventListener("click", () => {
          const y1 = parseInt(row.dataset.yStart, 10);
          const y2 = parseInt(row.dataset.yEnd, 10);
          toggleYearFilterRange(y1, y2, renderBars);
        });
      });
    };

    card.querySelectorAll(".dist-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.distEra) {
          state.distMode = "era";
        } else {
          state.distMode = "years";
          state.distStepYears = parseInt(btn.dataset.distStep, 10) || 3;
          if (customInput) customInput.value = state.distStepYears;
        }
        renderBars();
      });
    });

    if (customInput) {
      customInput.addEventListener("input", () => {
        const v = parseInt(customInput.value, 10);
        if (v >= 1 && v <= 30) {
          state.distMode = "years";
          state.distStepYears = v;
          renderBars();
        }
      });
    }

    renderBars();
  }

  function toggleYearFilterRange(y1, y2, afterCb) {
    if (state.yearMin === y1 && state.yearMax === y2 && (y1 !== state.dataYearMin || y2 !== state.dataYearMax)) {
      state.yearMin = state.dataYearMin;
      state.yearMax = state.dataYearMax;
    } else {
      state.yearMin = y1;
      state.yearMax = y2;
    }
    elYearMin.value = state.yearMin;
    elYearMax.value = state.yearMax;
    elYearRangeLabel.textContent = `${state.yearMin} – ${state.yearMax}`;
    rebuildVisibleGraph(false);
    if (afterCb) afterCb();
  }
  // =========================================================================
  // Right Inspector Rendering
  // =========================================================================
  function selectNode(node) {
    state.selectedNode = node;
    elRightPanel.classList.remove("collapsed");
    if (window.innerWidth <= 768) {
      elLeftPanel.classList.add("collapsed");
    }
    if (!node) {
      renderArtistOverview();
      elInspectorBody.scrollTop = 0;
      return;
    }

    const color = getNodeColor(node);
    const meta = NODE_TYPE_META[node.type] || { label: node.type };
    elInspectorTypeBadge.innerHTML = `<span class="color-dot" style="background:${color}"></span>${meta.label}: ${escapeHtml(node.label)}`;

    if (node.type === "Token") {
      renderTokenInspector(node);
    } else if (node.type === "Song") {
      renderSongInspector(node);
    } else {
      renderHubInspector(node);
    }
    elInspectorBody.scrollTop = 0;
  }

  function renderArtistOverview() {
    if (!state.rawGraph) return;
    const stats = state.rawGraph.stats || {};
    const profile = state.artistProfile || {};
    elInspectorTypeBadge.innerHTML = `<span class="color-dot" style="background:#e11d48"></span>アーティスト概要`;

    const hallmarksHtml = (profile.lyrical_hallmarks || [])
      .map((h) => `<li>${escapeHtml(h)}</li>`)
      .join("");

    const topTokensHtml = (stats.top_tokens || [])
      .slice(0, 14)
      .map((t) => {
        const col = (TOKEN_CATEGORY_META[t.category] && TOKEN_CATEGORY_META[t.category].color) || "#f43f5e";
        return `<button class="chip" data-jump-label="${escapeHtml(t.label)}" data-jump-type="Token"><span class="color-dot" style="background:${col}"></span>${escapeHtml(t.label)} (${t.song_count}曲)</button>`;
      })
      .join("");

    const topCoHtml = (stats.top_cooccurrences || [])
      .slice(0, 6)
      .map(
        (c) => `
        <div class="connected-item" data-jump-label="${escapeHtml(c.pair[0])}" data-jump-type="Token">
          <span class="connected-item-title">${escapeHtml(c.label)}</span>
          <span class="connected-item-sub">${c.count}曲で共起</span>
        </div>`
      )
      .join("");

    const allSongEntries = [];
    for (const n of state.nodeById.values()) {
      if (n.type === "Song") allSongEntries.push({ node: n, weight: 1 });
    }

    elInspectorBody.innerHTML = `
      <div class="node-title">${escapeHtml(state.rawGraph.meta.artist_name)}</div>
      <div class="node-subtitle">
        ${profile.name_en ? escapeHtml(profile.name_en) + " · " : ""}
        楽曲 ${stats.total_songs || 0}曲 ／ 歌詞ワード ${(stats.node_counts_by_type && stats.node_counts_by_type.Token) || 0}語
      </div>
      <div class="detail-card">
        <h4>現在の表示モード</h4>
        <p class="summary-text">${escapeHtml((PRESETS[state.preset] && PRESETS[state.preset].description) || "カスタム表示モードです。")}</p>
      </div>
      ${buildDistributionHtml("発表楽曲数の年数区間分布")}
      ${topTokensHtml ? `
      <div class="detail-card">
        <h4>最頻出の歌詞ワード（クリックでフォーカス）</h4>
        <div class="chip-list">${topTokensHtml}</div>
      </div>` : ""}
      ${topCoHtml ? `
      <div class="detail-card">
        <h4>強い共起ワードペア</h4>
        <div class="connected-list">${topCoHtml}</div>
      </div>` : ""}
      ${hallmarksHtml ? `
      <div class="detail-card">
        <h4>作詞の主な特徴</h4>
        <ul class="hallmark-list">${hallmarksHtml}</ul>
      </div>` : ""}
    `;

    mountDistributionWidget(allSongEntries, "#c93b33", false);
    bindInspectorJumpHandlers();
  }

  function renderTokenInspector(node) {
    const p = node.properties;
    const cat = p.category || "その他";
    const col = getNodeColor(node);
    const totalFreq = node.dynFreq ?? p.total_frequency ?? 0;
    const songCount = node.dynSongCount ?? p.song_count ?? 0;

    // Collect connected songs sorted by weight desc then release_year
    const edges = state.adjacency.get(node.id) || [];
    const songs = [];
    for (const e of edges) {
      if (e.type !== "CONTAINS_TOKEN") continue;
      const s = state.nodeById.get(e.source);
      if (s && s.type === "Song") {
        songs.push({ node: s, weight: e.weight || 1 });
      }
    }
    songs.sort((a, b) => b.weight - a.weight || (a.node.properties.release_year || 0) - (b.node.properties.release_year || 0));

    // Era distribution bars
    const eraCounts = p.era_counts || {};
    const eraEntries = Object.entries(eraCounts);
    const maxEra = Math.max(1, ...eraEntries.map(([, v]) => v));
    const eraBarsHtml = eraEntries
      .map(
        ([eraName, cnt]) => `
        <div class="mini-bar-row">
          <div class="mini-bar-label" title="${escapeHtml(eraName)}">${escapeHtml(eraName.split(" ")[0])}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(cnt / maxEra) * 100}%;background:${col}"></div></div>
          <div class="bar-val">${cnt}</div>
        </div>`
      )
      .join("");

    // Top co-occurring tokens
    const coList = p.top_cooccurrences || [];
    const coChipsHtml = coList
      .map((co) => {
        let targetCol = "#f43f5e";
        for (const n of state.nodeById.values()) {
          if (n.type === "Token" && n.label === co.token) {
            targetCol = getNodeColor(n);
            break;
          }
        }
        return `<button class="chip" data-jump-label="${escapeHtml(co.token)}" data-jump-type="Token"><span class="color-dot" style="background:${targetCol}"></span>${escapeHtml(co.token)} (${co.song_count})</button>`;
      })
      .join("");

    const songsHtml = songs
      .map(
        ({ node: s, weight }) => `
        <div class="connected-item" data-jump-id="${s.id}">
          <span class="connected-item-title">${escapeHtml(s.label)}</span>
          <span class="connected-item-sub">${s.properties.release_year} · ${Math.round(weight)}回出現</span>
        </div>`
      )
      .join("");

    elInspectorBody.innerHTML = `
      <div class="node-title">${escapeHtml(node.label)}</div>
      <div class="node-subtitle">語彙カテゴリ: ${escapeHtml(cat)}</div>

      <div class="kpi-grid">
        <div class="kpi-box">
          <div class="kpi-val">${songCount}<span style="font-size:12px;font-weight:500;color:#94a3b8"> 曲</span></div>
          <div class="kpi-label">登場する楽曲数</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-val">${totalFreq}<span style="font-size:12px;font-weight:500;color:#94a3b8"> 回</span></div>
          <div class="kpi-label">歌詞中の総出現回数</div>
        </div>
      </div>

      <div class="inspector-actions">
        <button class="primary-btn" id="btnEgoFromInspector">この単語の周辺を抽出</button>
        <button class="secondary-btn" id="btnOverviewBack">概要へ戻る</button>
      </div>

      ${coChipsHtml ? `
      <div class="detail-card">
        <h4>一緒によく出る単語（共起 TOP10）</h4>
        <div class="chip-list">${coChipsHtml}</div>
      </div>` : ""}

      ${buildDistributionHtml("出現分布（年数区間 / 活動期）")}

      <div class="detail-card">
        <h4>この単語が登場する楽曲 (${songs.length}曲)</h4>
        <div class="connected-list">${songsHtml || '<p class="hint-text">該当する楽曲はありません。</p>'}</div>
      </div>
    `;

    mountDistributionWidget(songs, col, true);
    document.getElementById("btnEgoFromInspector").addEventListener("click", () => enterEgoMode(node.id));
    document.getElementById("btnOverviewBack").addEventListener("click", () => {
      state.selectedNode = null;
      renderArtistOverview();
    });
    bindInspectorJumpHandlers();
  }

  function renderSongInspector(node) {
    const p = node.properties;
    const edges = state.adjacency.get(node.id) || [];

    const grouped = {
      Token: [],
      Theme: [],
      Motif: [],
      Place: [],
      Style: [],
      Mood: [],
      Album: [],
      Artist: [],
      Language: [],
    };
    const songRelations = [];

    for (const e of edges) {
      if (e.type === "RELATED_SONG") {
        const otherId = e.source === node.id ? e.target : e.source;
        const other = state.nodeById.get(otherId);
        if (other) {
          songRelations.push({
            node: other,
            relation: (e.properties && e.properties.relation) || "RELATED",
            note: (e.properties && e.properties.note) || "",
          });
        }
        continue;
      }
      const otherId = e.source === node.id ? e.target : e.source;
      const other = state.nodeById.get(otherId);
      if (other && grouped[other.type]) {
        if (!grouped[other.type].some((x) => x.node.id === other.id)) {
          grouped[other.type].push({ node: other, weight: e.weight || 1 });
        }
      }
    }

    grouped.Token.sort((a, b) => b.weight - a.weight);

    const makeChips = (list, showCount = false) =>
      list
        .map(
          ({ node: item, weight }) =>
            `<button class="chip" data-jump-id="${item.id}"><span class="color-dot" style="background:${getNodeColor(item)}"></span>${escapeHtml(item.label)}${showCount && weight ? ` (${Math.round(weight)})` : ""}</button>`
        )
        .join("");

    const relationsHtml = songRelations
      .map(
        (r) => `
        <div class="relation-card" data-jump-id="${r.node.id}">
          <div class="relation-kind">${escapeHtml(RELATION_LABELS[r.relation] || r.relation)}</div>
          <div class="relation-target">→ ${escapeHtml(r.node.label)}</div>
          ${r.note ? `<div class="relation-note">${escapeHtml(r.note)}</div>` : ""}
        </div>`
      )
      .join("");

    elInspectorBody.innerHTML = `
      <div class="node-title">${escapeHtml(node.label)}</div>
      <div class="node-subtitle">${p.release_year}年 · ${escapeHtml(p.performer)} · ${escapeHtml(p.activity_label || "")}</div>

      <div class="inspector-actions">
        <button class="primary-btn" id="btnEgoFromInspector">近傍のみ抽出</button>
        <button class="secondary-btn" id="btnOverviewBack">歌手概要へ</button>
      </div>

      ${p.summary ? `
      <div class="detail-card">
        <h4>楽曲・歌詞の解説</h4>
        <p class="summary-text">${escapeHtml(p.summary)}</p>
      </div>` : ""}

      ${grouped.Token.length ? `
      <div class="detail-card">
        <h4>歌詞中に実在する単語・トークン (${grouped.Token.length}語 / 括弧内は出現回数)</h4>
        <div class="chip-list">${makeChips(grouped.Token, true)}</div>
      </div>` : ""}

      <div class="detail-card">
        <h4>クレジット・メタ情報</h4>
        <div class="meta-grid">
          <div class="meta-key">作詞</div><div class="meta-val">${escapeHtml((p.lyricist || []).join(" / "))}</div>
          <div class="meta-key">作曲</div><div class="meta-val">${escapeHtml((p.composer || []).join(" / "))}</div>
          <div class="meta-key">活動期</div><div class="meta-val">${escapeHtml(p.era || "-")}</div>
          <div class="meta-key">収録盤</div><div class="meta-val">${escapeHtml((p.albums && p.albums.length) ? p.albums.join(" / ") : "シングル等")}</div>
          ${p.tie_up ? `<div class="meta-key">タイアップ</div><div class="meta-val">${escapeHtml(p.tie_up)}</div>` : ""}
        </div>
      </div>

      ${songRelations.length > 0 ? `
      <div class="detail-card">
        <h4>曲間リンク・対称関係 (${songRelations.length})</h4>
        ${relationsHtml}
      </div>` : ""}

      ${grouped.Theme.length ? `<div class="detail-card"><h4>テーマ</h4><div class="chip-list">${makeChips(grouped.Theme)}</div></div>` : ""}
      ${grouped.Motif.length ? `<div class="detail-card"><h4>モチーフ・象徴</h4><div class="chip-list">${makeChips(grouped.Motif)}</div></div>` : ""}
      ${grouped.Place.length ? `<div class="detail-card"><h4>登場地名・場所</h4><div class="chip-list">${makeChips(grouped.Place)}</div></div>` : ""}
      ${grouped.Style.length ? `<div class="detail-card"><h4>作詞技法・文体</h4><div class="chip-list">${makeChips(grouped.Style)}</div></div>` : ""}
      ${grouped.Mood.length ? `<div class="detail-card"><h4>感情・雰囲気</h4><div class="chip-list">${makeChips(grouped.Mood)}</div></div>` : ""}
    `;

    document.getElementById("btnEgoFromInspector").addEventListener("click", () => enterEgoMode(node.id));
    document.getElementById("btnOverviewBack").addEventListener("click", () => {
      state.selectedNode = null;
      renderArtistOverview();
    });
    bindInspectorJumpHandlers();
  }

  function renderHubInspector(node) {
    const edges = state.adjacency.get(node.id) || [];
    const connectedSongs = [];
    const connectedOthers = [];
    const seen = new Set();

    for (const e of edges) {
      const otherId = e.source === node.id ? e.target : e.source;
      if (seen.has(otherId)) continue;
      seen.add(otherId);
      const other = state.nodeById.get(otherId);
      if (!other) continue;
      if (other.type === "Song") connectedSongs.push(other);
      else connectedOthers.push(other);
    }

    connectedSongs.sort((a, b) => (a.properties.release_year || 0) - (b.properties.release_year || 0));

    const songItemsHtml = connectedSongs
      .map(
        (s) => `
        <div class="connected-item" data-jump-id="${s.id}">
          <span class="connected-item-title">${escapeHtml(s.label)}</span>
          <span class="connected-item-sub">${s.properties.release_year} · ${escapeHtml(s.properties.performer)}</span>
        </div>`
      )
      .join("");

    const roleLine =
      node.type === "Artist" && node.properties.roles && node.properties.roles.length
        ? `役割: ${node.properties.roles.join(" / ")}`
        : node.properties.description || `関連楽曲 ${connectedSongs.length}曲`;

    elInspectorBody.innerHTML = `
      <div class="node-title">${escapeHtml(node.label)}</div>
      <div class="node-subtitle">${escapeHtml(roleLine)}</div>

      <div class="inspector-actions">
        <button class="primary-btn" id="btnEgoFromInspector">近傍のみ抽出</button>
        <button class="secondary-btn" id="btnOverviewBack">歌手概要へ</button>
      </div>

      ${connectedOthers.length > 0 ? `
      <div class="detail-card">
        <h4>関連ノード (${connectedOthers.length})</h4>
        <div class="chip-list">
          ${connectedOthers
            .map((o) => `<button class="chip" data-jump-id="${o.id}"><span class="color-dot" style="background:${getNodeColor(o)}"></span>${escapeHtml(o.label)}</button>`)
            .join("")}
        </div>
      </div>` : ""}

      ${connectedSongs.length > 0 ? buildDistributionHtml("出現分布（年数区間 / 活動期）") : ""}

      <div class="detail-card">
        <h4>関連する楽曲一覧 (${connectedSongs.length}曲 / 年代順)</h4>
        <div class="connected-list">${songItemsHtml || '<p class="hint-text">該当する楽曲はありません。</p>'}</div>
      </div>
    `;

    if (connectedSongs.length > 0) {
      mountDistributionWidget(
        connectedSongs.map((s) => ({ node: s, weight: 1 })),
        getNodeColor(node),
        false
      );
    }
    document.getElementById("btnEgoFromInspector").addEventListener("click", () => enterEgoMode(node.id));
    document.getElementById("btnOverviewBack").addEventListener("click", () => {
      state.selectedNode = null;
      renderArtistOverview();
    });
    bindInspectorJumpHandlers();
  }

  function bindInspectorJumpHandlers() {
    elInspectorBody.querySelectorAll("[data-jump-id]").forEach((el) => {
      el.addEventListener("click", () => focusNodeById(el.dataset.jumpId));
    });
    elInspectorBody.querySelectorAll("[data-jump-label]").forEach((el) => {
      el.addEventListener("click", () => {
        const lbl = el.dataset.jumpLabel;
        const type = el.dataset.jumpType;
        for (const n of state.nodeById.values()) {
          if (n.label === lbl && (!type || n.type === type)) {
            focusNodeById(n.id);
            break;
          }
        }
      });
    });
  }

  // =========================================================================
  // Stats Modal
  // =========================================================================
  function openStatsModal() {
    if (!state.rawGraph) return;
    const stats = state.rawGraph.stats || {};
    elStatsTitle.textContent = `${state.rawGraph.meta.artist_name} — 作詞・歌詞ワード統計`;
    elStatsSubtitle.textContent = `全${stats.total_songs}曲 / ${stats.total_nodes}ノード / ${stats.total_edges}エッジ（項目クリックでグラフ上にフォーカス）`;

    const buildBarSection = (title, items, colorFn, nodeType) => {
      const maxVal = Math.max(1, ...items.map((x) => x.count));
      const rows = items
        .slice(0, 14)
        .map((item) => {
          const col = typeof colorFn === "function" ? colorFn(item) : colorFn;
          return `
            <div class="bar-row" data-stat-label="${escapeHtml(item.jumpLabel || item.label)}" data-stat-type="${nodeType || ""}">
              <div class="bar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${(item.count / maxVal) * 100}%;background:${col}"></div></div>
              <div class="bar-val">${item.count}</div>
            </div>`;
        })
        .join("");
      return `<div class="stat-panel"><h4>${title}</h4>${rows}</div>`;
    };

    const tokenItems = (stats.top_tokens || []).map((t) => ({
      label: `${t.label} (${t.song_count}曲)`,
      jumpLabel: t.label,
      count: t.count,
      category: t.category,
    }));

    const coItems = (stats.top_cooccurrences || []).map((c) => ({
      label: c.label,
      jumpLabel: c.pair[0],
      count: c.count,
    }));

    elStatsContent.innerHTML =
      buildBarSection(
        "頻出歌詞ワード TOP14（頻度スコア）",
        tokenItems,
        (it) => (TOKEN_CATEGORY_META[it.category] && TOKEN_CATEGORY_META[it.category].color) || "#f43f5e",
        "Token"
      ) +
      buildBarSection("頻出ワード共起ペア TOP14（共起曲数）", coItems, "#fbbf24", "Token") +
      buildBarSection("頻出テーマ TOP14", stats.top_themes || [], NODE_TYPE_META.Theme.color, "Theme") +
      buildBarSection("頻出モチーフ TOP14", stats.top_motifs || [], NODE_TYPE_META.Motif.color, "Motif") +
      buildBarSection("作詞技法・文体", stats.top_styles || [], NODE_TYPE_META.Style.color, "Style") +
      buildBarSection("登場地名・場所 TOP14", stats.top_places || [], NODE_TYPE_META.Place.color, "Place");

    elStatsContent.querySelectorAll(".bar-row[data-stat-type]").forEach((row) => {
      const t = row.dataset.statType;
      if (!t) return;
      row.addEventListener("click", () => {
        const lbl = row.dataset.statLabel;
        elStatsModal.classList.add("hidden");
        for (const n of state.nodeById.values()) {
          if (n.type === t && n.label === lbl) {
            focusNodeById(n.id);
            break;
          }
        }
      });
    });

    elStatsModal.classList.remove("hidden");
  }

  // =========================================================================
  // Event Binding
  // =========================================================================
  function bindEvents() {
    elArtistSelect.addEventListener("change", (ev) => loadArtist(ev.target.value));

    elPresetTabs.querySelectorAll(".preset-tab").forEach((btn) => {
      btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
    });

    // Min token songs slider
    elMinTokenSongsSlider.addEventListener("input", () => {
      state.minTokenSongs = parseInt(elMinTokenSongsSlider.value, 10);
      elMinTokenSongsLabel.textContent = `${state.minTokenSongs}曲以上`;
      rebuildVisibleGraph(true);
      fitToView();
    });

    // Search
    elSearchInput.addEventListener("input", () => {
      const q = elSearchInput.value.trim().toLowerCase();
      if (!q) {
        elSearchResults.classList.add("hidden");
        return;
      }
      const matches = [];
      for (const n of state.nodeById.values()) {
        const labelHit = n.label.toLowerCase().includes(q);
        const subHit =
          n.type === "Song" &&
          ((n.properties.performer || "").toLowerCase().includes(q) ||
            (n.properties.tie_up || "").toLowerCase().includes(q) ||
            (n.properties.summary || "").toLowerCase().includes(q));
        if (labelHit || subHit) {
          matches.push({ node: n, score: labelHit ? 2 : 1 });
        }
      }
      matches.sort((a, b) => b.score - a.score || (b.node.properties.degree || 0) - (a.node.properties.degree || 0));
      const top = matches.slice(0, 14);
      if (top.length === 0) {
        elSearchResults.innerHTML = `<div class="search-item"><span class="search-item-type">一致するノードがありません</span></div>`;
      } else {
        elSearchResults.innerHTML = top
          .map(({ node }) => {
            const meta = NODE_TYPE_META[node.type] || { label: node.type };
            return `
              <div class="search-item" data-search-id="${node.id}">
                <div class="search-item-main">
                  <span class="color-dot" style="background:${getNodeColor(node)}"></span>
                  <span class="search-item-label">${escapeHtml(node.label)}</span>
                </div>
                <span class="search-item-type">${meta.label}</span>
              </div>`;
          })
          .join("");
        elSearchResults.querySelectorAll("[data-search-id]").forEach((el) => {
          el.addEventListener("click", () => {
            focusNodeById(el.dataset.searchId);
            elSearchResults.classList.add("hidden");
            elSearchInput.value = "";
          });
        });
      }
      elSearchResults.classList.remove("hidden");
    });

    document.addEventListener("click", (ev) => {
      if (!ev.target.closest(".search-box")) {
        elSearchResults.classList.add("hidden");
      }
    });

    // Year sliders
    const onYearChange = () => {
      let minV = parseInt(elYearMin.value, 10);
      let maxV = parseInt(elYearMax.value, 10);
      if (minV > maxV) {
        const tmp = minV;
        minV = maxV;
        maxV = tmp;
      }
      state.yearMin = minV;
      state.yearMax = maxV;
      elYearRangeLabel.textContent = `${minV} – ${maxV}`;
      rebuildVisibleGraph(false);
      if (state.running) state.alpha = Math.max(state.alpha, 0.35);
    };
    elYearMin.addEventListener("input", onYearChange);
    elYearMax.addEventListener("input", onYearChange);

    // Reset filters
    document.getElementById("btnResetFilters").addEventListener("click", () => {
      state.enabledActivities = new Set(Object.keys(ACTIVITY_META));
      state.enabledTokenCategories = new Set(Object.keys(TOKEN_CATEGORY_META));
      state.minTokenSongs = 5;
      elMinTokenSongsSlider.value = 5;
      elMinTokenSongsLabel.textContent = "5曲以上";
      state.yearMin = state.dataYearMin;
      state.yearMax = state.dataYearMax;
      elYearMin.value = state.dataYearMin;
      elYearMax.value = state.dataYearMax;
      elYearRangeLabel.textContent = `${state.dataYearMin} – ${state.dataYearMax}`;
      elActivityFilters.querySelectorAll("input").forEach((cb) => (cb.checked = true));
      elTokenCategoryFilters.querySelectorAll("input").forEach((cb) => (cb.checked = true));
      for (const n of state.nodeById.values()) { n.fx = null; n.fy = null; }
      applyPreset("lyrics_cooccur");
    });

    // Layout settings
    elLabelMode.addEventListener("change", () => (state.labelMode = elLabelMode.value));
    elRepulsionSlider.addEventListener("input", () => {
      state.repulsion = parseInt(elRepulsionSlider.value, 10);
      if (state.running) {
        state.alpha = Math.max(state.alpha, 0.5);
      } else {
        computeStaticNonOverlappingLayout(90, 90);
        fitToView();
      }
    });
    elEdgeAlphaSlider.addEventListener("input", () => {
      state.edgeAlpha = parseInt(elEdgeAlphaSlider.value, 10) / 100;
    });

    // External JSON upload
    document.getElementById("jsonFileInput").addEventListener("change", (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!parsed.nodes || !parsed.edges) throw new Error("Invalid schema");
          setGraphData(parsed, null);
        } catch (err) {
          alert("有効な knowledge_graph.json / lyrics_knowledge_graph.json ファイルではありません。");
        }
      };
      reader.readAsText(file, "utf-8");
    });

    // Sidebar toggles (with ghost-click guard so closing never taps canvas underneath)
    const armCanvasGuard = (ms = 380) => {
      state.ignoreCanvasUntil = performance.now() + ms;
      state.dragNode = null;
      state.isPanning = false;
      state.hoveredNode = null;
      showTooltip(null);
    };

    [elLeftPanel, elRightPanel].forEach((panel) => {
      ["touchstart", "touchend", "mousedown"].forEach((evtName) => {
        panel.addEventListener(evtName, (ev) => {
          ev.stopPropagation();
        }, { passive: true });
      });
    });

    document.getElementById("btnToggleLeft").addEventListener("click", (ev) => {
      ev.stopPropagation();
      armCanvasGuard();
      elLeftPanel.classList.toggle("collapsed");
      if (window.innerWidth <= 768 && !elLeftPanel.classList.contains("collapsed")) {
        elRightPanel.classList.add("collapsed");
      }
      setTimeout(resizeCanvas, 220);
    });

    const closeRightBtn = document.getElementById("btnCloseRight");
    const closeRightHandler = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      ev.stopPropagation();
      armCanvasGuard(420);
      state.selectedNode = null;
      state.hoveredNode = null;
      elRightPanel.classList.add("collapsed");
      setTimeout(resizeCanvas, 220);
    };
    closeRightBtn.addEventListener("touchend", closeRightHandler, { passive: false });
    closeRightBtn.addEventListener("click", closeRightHandler);

    const openArtistOverviewSheet = () => {
      state.selectedNode = null;
      renderArtistOverview();
      elRightPanel.classList.remove("collapsed");
      if (window.innerWidth <= 768) {
        elLeftPanel.classList.add("collapsed");
      }
      setTimeout(resizeCanvas, 220);
    };
    document.getElementById("btnArtistOverview").addEventListener("click", openArtistOverviewSheet);
    document.getElementById("btnHudOverview").addEventListener("click", openArtistOverviewSheet);

    // Ego exit
    document.getElementById("btnExitEgo").addEventListener("click", () => {
      state.egoRootId = null;
      rebuildVisibleGraph(true);
      fitToView();
    });

    // Topbar tools
    document.getElementById("btnFit").addEventListener("click", fitToView);
    const btnFitCanvas = document.getElementById("btnFitCanvas");
    if (btnFitCanvas) btnFitCanvas.addEventListener("click", fitToView);
    const btnPause = document.getElementById("btnPause");
    const togglePause = () => {
      state.running = !state.running;
      btnPause.textContent = state.running ? "動的計算" : "固定中";
      btnPause.classList.toggle("active", !state.running);
      if (state.running) {
        state.alpha = Math.max(state.alpha, 0.45);
      } else {
        resolveOverlaps(60);
        state.alpha = 0;
      }
    };
    btnPause.addEventListener("click", togglePause);

    document.getElementById("btnExportPng").addEventListener("click", () => {
      const link = document.createElement("a");
      const slug = (state.rawGraph && state.rawGraph.meta && state.rawGraph.meta.artist_slug) || "graph";
      link.download = `knowledge_graph_${slug}_${state.preset}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });

    // Stats modal
    document.getElementById("btnStats").addEventListener("click", openStatsModal);
    document.getElementById("btnCloseStats").addEventListener("click", () => elStatsModal.classList.add("hidden"));
    document.getElementById("statsBackdrop").addEventListener("click", () => elStatsModal.classList.add("hidden"));

    // Zoom controls
    document.getElementById("btnZoomIn").addEventListener("click", () => {
      state.targetCam = { x: state.camX, y: state.camY, zoom: Math.min(4.0, state.zoom * 1.35) };
    });
    document.getElementById("btnZoomOut").addEventListener("click", () => {
      state.targetCam = { x: state.camX, y: state.camY, zoom: Math.max(0.18, state.zoom / 1.35) };
    });
    document.getElementById("btnReheat").addEventListener("click", () => {
      for (const n of state.nodes) { n.fx = null; n.fy = null; }
      rebuildVisibleGraph(true);
      fitToView();
    });

    // Keyboard shortcuts
    window.addEventListener("keydown", (ev) => {
      if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "SELECT") return;
      if (ev.key === "f" || ev.key === "F") fitToView();
      if (ev.key === " ") { ev.preventDefault(); togglePause(); }
      if (ev.key === "Escape") {
        elStatsModal.classList.add("hidden");
        if (state.egoRootId) {
          state.egoRootId = null;
          rebuildVisibleGraph(true);
        }
      }
    });

    // Canvas Mouse Interactions
    canvas.addEventListener("mousedown", (ev) => {
      if (performance.now() < state.ignoreCanvasUntil) return;
      const rect = canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      state.targetCam = null;
      state.pointerDownTime = performance.now();
      state.pointerMoved = false;
      state.panStartX = sx;
      state.panStartY = sy;

      const hit = findNodeAt(sx, sy, false);
      if (hit) {
        state.dragNode = hit;
        canvas.classList.add("dragging");
      } else {
        state.isPanning = true;
        state.camStartX = state.camX;
        state.camStartY = state.camY;
        canvas.classList.add("dragging");
      }
    });

    window.addEventListener("mousemove", (ev) => {
      if (performance.now() < state.ignoreCanvasUntil) return;
      const rect = canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;

      if (state.dragNode) {
        const moveDist = Math.hypot(sx - state.panStartX, sy - state.panStartY);
        if (moveDist > 6) {
          state.pointerMoved = true;
        }
        if (state.pointerMoved) {
          const w = screenToWorld(sx, sy);
          state.dragNode.fx = w.x;
          state.dragNode.fy = w.y;
          state.dragNode.x = w.x;
          state.dragNode.y = w.y;
          if (state.running) {
            state.alpha = Math.max(state.alpha, 0.25);
          }
          showTooltip(null);
        }
        return;
      }

      if (state.isPanning) {
        const moveDist = Math.hypot(sx - state.panStartX, sy - state.panStartY);
        if (moveDist > 5) state.pointerMoved = true;
        if (state.pointerMoved) {
          state.camX = state.camStartX - (sx - state.panStartX) / state.zoom;
          state.camY = state.camStartY - (sy - state.panStartY) / state.zoom;
          showTooltip(null);
        }
        return;
      }

      if (ev.target === canvas && sx >= 0 && sy >= 0 && sx <= rect.width && sy <= rect.height) {
        const hit = findNodeAt(sx, sy, false);
        state.hoveredNode = hit;
        canvas.classList.toggle("pointer", Boolean(hit));
        showTooltip(hit, sx, sy);
      } else {
        state.hoveredNode = null;
        canvas.classList.remove("pointer");
        showTooltip(null);
      }
    });

    window.addEventListener("mouseup", (ev) => {
      if (performance.now() < state.ignoreCanvasUntil) {
        state.dragNode = null;
        state.isPanning = false;
        canvas.classList.remove("dragging");
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;

      if (state.dragNode) {
        const clickedNode = state.dragNode;
        if (!state.pointerMoved) {
          selectNode(clickedNode);
        }
        state.dragNode = null;
      } else if (state.isPanning) {
        if (!state.pointerMoved && sx >= 0 && sy >= 0 && sx <= rect.width && sy <= rect.height) {
          state.selectedNode = null;
          state.hoveredNode = null;
          showTooltip(null);
          renderArtistOverview();
          if (window.innerWidth <= 768) {
            elRightPanel.classList.add("collapsed");
            elLeftPanel.classList.add("collapsed");
          }
        }
        state.isPanning = false;
      }
      canvas.classList.remove("dragging");
    });

    canvas.addEventListener("dblclick", (ev) => {
      const rect = canvas.getBoundingClientRect();
      const hit = findNodeAt(ev.clientX - rect.left, ev.clientY - rect.top, false);
      if (hit) {
        enterEgoMode(hit.id);
      }
    });

    // Mobile & Tablet Touch Interactions (1-finger pan/drag/tap/double-tap, 2-finger pinch zoom)
    let touchPinchDist = 0;
    let touchLastTapTime = 0;
    let touchLastTapNodeId = null;

    canvas.addEventListener(
      "touchstart",
      (ev) => {
        if (performance.now() < state.ignoreCanvasUntil) return;
        if (ev.cancelable) ev.preventDefault();
        state.targetCam = null;
        showTooltip(null);
        const rect = canvas.getBoundingClientRect();

        if (ev.touches.length === 2) {
          state.dragNode = null;
          state.isPanning = false;
          const dx = ev.touches[0].clientX - ev.touches[1].clientX;
          const dy = ev.touches[0].clientY - ev.touches[1].clientY;
          touchPinchDist = Math.hypot(dx, dy);
          return;
        }

        if (ev.touches.length === 1) {
          const sx = ev.touches[0].clientX - rect.left;
          const sy = ev.touches[0].clientY - rect.top;
          state.pointerMoved = false;
          state.panStartX = sx;
          state.panStartY = sy;

          const hit = findNodeAt(sx, sy, true);
          if (hit) {
            state.dragNode = hit;
          } else {
            state.isPanning = true;
            state.camStartX = state.camX;
            state.camStartY = state.camY;
          }
        }
      },
      { passive: false }
    );

    canvas.addEventListener(
      "touchmove",
      (ev) => {
        if (ev.cancelable) ev.preventDefault();
        const rect = canvas.getBoundingClientRect();

        if (ev.touches.length === 2) {
          const t0 = ev.touches[0];
          const t1 = ev.touches[1];
          const dx = t0.clientX - t1.clientX;
          const dy = t0.clientY - t1.clientY;
          const newDist = Math.hypot(dx, dy);
          if (touchPinchDist > 8 && newDist > 8) {
            const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
            const midY = (t0.clientY + t1.clientY) / 2 - rect.top;
            const before = screenToWorld(midX, midY);
            const scale = newDist / touchPinchDist;
            state.zoom = Math.min(4.5, Math.max(0.16, state.zoom * scale));
            const after = screenToWorld(midX, midY);
            state.camX += before.x - after.x;
            state.camY += before.y - after.y;
          }
          touchPinchDist = newDist;
          return;
        }

        if (ev.touches.length === 1) {
          const sx = ev.touches[0].clientX - rect.left;
          const sy = ev.touches[0].clientY - rect.top;
          const moveDist = Math.hypot(sx - state.panStartX, sy - state.panStartY);

          if (state.dragNode) {
            // Require at least 9px movement before treating touch as node drag (prevents accidental drag on tap!)
            if (moveDist > 9) {
              state.pointerMoved = true;
            }
            if (state.pointerMoved) {
              const w = screenToWorld(sx, sy);
              state.dragNode.fx = w.x;
              state.dragNode.fy = w.y;
              state.dragNode.x = w.x;
              state.dragNode.y = w.y;
            }
            return;
          }

          if (state.isPanning) {
            if (moveDist > 7) state.pointerMoved = true;
            if (state.pointerMoved) {
              state.camX = state.camStartX - (sx - state.panStartX) / state.zoom;
              state.camY = state.camStartY - (sy - state.panStartY) / state.zoom;
            }
          }
        }
      },
      { passive: false }
    );

    canvas.addEventListener(
      "touchend",
      (ev) => {
        if (performance.now() < state.ignoreCanvasUntil) {
          state.dragNode = null;
          state.isPanning = false;
          return;
        }
        if (ev.cancelable) ev.preventDefault();
        if (ev.touches.length < 2) {
          touchPinchDist = 0;
        }
        if (state.dragNode) {
          const tapped = state.dragNode;
          if (!state.pointerMoved) {
            const now = performance.now();
            if (touchLastTapNodeId === tapped.id && now - touchLastTapTime < 340) {
              enterEgoMode(tapped.id);
              touchLastTapNodeId = null;
            } else {
              selectNode(tapped);
              touchLastTapNodeId = tapped.id;
              touchLastTapTime = now;
            }
          }
          state.dragNode = null;
        } else if (state.isPanning) {
          if (!state.pointerMoved) {
            state.selectedNode = null;
            state.hoveredNode = null;
            showTooltip(null);
            renderArtistOverview();
            if (window.innerWidth <= 768) {
              elRightPanel.classList.add("collapsed");
              elLeftPanel.classList.add("collapsed");
            }
          }
          state.isPanning = false;
        }
      },
      { passive: false }
    );

    canvas.addEventListener(
      "wheel",
      (ev) => {
        ev.preventDefault();
        state.targetCam = null;
        const rect = canvas.getBoundingClientRect();
        const sx = ev.clientX - rect.left;
        const sy = ev.clientY - rect.top;
        const before = screenToWorld(sx, sy);
        const factor = ev.deltaY < 0 ? 1.14 : 1 / 1.14;
        state.zoom = Math.min(4.5, Math.max(0.16, state.zoom * factor));
        const after = screenToWorld(sx, sy);
        state.camX += before.x - after.x;
        state.camY += before.y - after.y;
      },
      { passive: false }
    );
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  init();
})();
