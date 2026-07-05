/* ============================================================================
   SUMI  |  shared client-side layer
   Loaded on every page after the Supabase UMD bundle and config.js.
   Exposes: window.sb (client), window.AppState, and window.Sumi (helpers).
   ============================================================================ */

(function () {
  const cfg = window.SUMI_CONFIG || {};
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
    console.warn("Sumi: fill in js/config.js with your Supabase URL and anon key.");
  }

  // The UMD bundle exposes a global `supabase` with createClient on it.
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  window.sb = sb;

  // ---- shared in-memory state, populated once per page load -----------------
  const AppState = {
    session: null,
    profile: null,
    manga: [],        // catalog, loaded lazily by pages that need it
    showMature: localStorage.getItem("sumi_mature") === "1",
  };
  window.AppState = AppState;

  // ---------------------------------------------------------------------------
  const Sumi = {
    // Redirect to login if there is no session. Returns the session or null.
    async requireAuth() {
      const { data } = await sb.auth.getSession();
      if (!data.session) {
        const back = encodeURIComponent(location.pathname + location.search);
        location.replace("login.html?next=" + back);
        return null;
      }
      AppState.session = data.session;
      await this.loadProfile();
      return data.session;
    },

    async loadProfile() {
      if (!AppState.session) return null;
      const { data } = await sb
        .from("user_profiles")
        .select("*")
        .eq("id", AppState.session.user.id)
        .maybeSingle();
      AppState.profile = data || null;
      return AppState.profile;
    },

    async signOut() {
      await sb.auth.signOut();
      location.href = "login.html";
    },

    setMature(on) {
      AppState.showMature = on;
      localStorage.setItem("sumi_mature", on ? "1" : "0");
    },

    // Load the whole catalog (manga only, no pages) once.
    async loadCatalog() {
      const { data, error } = await sb
        .from("manga")
        .select("id,slug,title,author,cover_url,banner_url,genres,status,reading_direction,content_rating,year,description")
        .order("title", { ascending: true });
      if (error) { console.error(error); return []; }
      AppState.manga = data || [];
      return AppState.manga;
    },

    visibleManga() {
      return AppState.showMature
        ? AppState.manga
        : AppState.manga.filter((m) => m.content_rating !== "mature");
    },

    // Render the top navigation into <header id="nav">.
    renderNav(active) {
      const el = document.getElementById("nav");
      if (!el) return;
      const name = AppState.profile?.username || "reader";
      const isAdmin = !!AppState.profile?.is_admin;
      el.innerHTML = `
        <a class="brand" href="index.html" aria-label="Sumi home">
          <svg class="brand-mark" viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">
            <rect x="6" y="6" width="52" height="52" rx="15" fill="#d6452f"/>
            <path d="M42 22 C42 15 30 14 25 19 C20 24 24 30 32 32 C40 34 44 40 39 45 C34 50 22 49 22 42" fill="none" stroke="#f3ecdf" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="brand-word">SUMI</span>
        </a>
        <nav class="nav-links">
          <a href="index.html" class="${active === "library" ? "on" : ""}">Library</a>
          ${isAdmin ? `<a href="stats.html" class="${active === "stats" ? "on" : ""}">Stats</a>` : ""}
        </nav>
        <div class="nav-right">
          <label class="mature-toggle" title="Show mature titles">
            <input type="checkbox" id="matureToggle" ${AppState.showMature ? "checked" : ""}>
            <span>Abyss</span>
          </label>
          <span class="who">${name}</span>
          <button class="ghost" id="signOutBtn">Sign out</button>
        </div>`;
      const t = document.getElementById("matureToggle");
      if (t) t.addEventListener("change", (e) => {
        Sumi.setMature(e.target.checked);
        document.dispatchEvent(new CustomEvent("sumi:mature-changed"));
      });
      const so = document.getElementById("signOutBtn");
      if (so) so.addEventListener("click", () => Sumi.signOut());
    },

    // A safe placeholder cover if a title has no cover_url.
    coverStyle(m) {
      if (m.cover_url) return `background-image:url('${m.cover_url}')`;
      const hue = Math.abs(hashCode(m.slug || m.title)) % 360;
      return `background:linear-gradient(160deg,hsl(${hue} 20% 22%),hsl(${hue} 25% 12%))`;
    },

    chapterLabel(ch) {
      const n = Number(ch.chapter_number);
      const num = Number.isInteger(n) ? n : n.toFixed(1);
      return ch.title ? `Ch. ${num} — ${ch.title}` : `Chapter ${num}`;
    },
  };
  window.Sumi = Sumi;

  function hashCode(str) {
    let h = 0;
    for (let i = 0; i < (str || "").length; i++) h = (h << 5) - h + str.charCodeAt(i) | 0;
    return h;
  }
})();
