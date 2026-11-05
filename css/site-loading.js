/* Site loading screen for web-port games (gn-math style "LOADING..." / spinner templates):
   logo of the site (UBG88 or Funny School, picked by host -- the same file runs on both) + % of bytes downloaded.
   Must be the FIRST script in <head> so it sees every download.
     data-total  bytes of the heavy files the game downloads (parts, Build/*, .pck, .wasm, .data...)
     data-watch  selector of the game's own loading element: the overlay goes once that element is removed or hidden
     data-done   (instead of data-watch) JS expression that becomes true when the game is up
     data-theme  "dark" (default) or "light"
     data-no-open  window.open does nothing (porter credit buttons)
   Unity 2020+ (createUnityInstance) / Unity 2019 (UnityLoader.instantiate) are hooked so the overlay stays until the game runs. */
(function () {
    var me = document.currentScript;
    var TOTAL = +me.getAttribute("data-total") || 0;
    var WATCH = me.getAttribute("data-watch");
    var DONE = me.getAttribute("data-done");
    var light = me.getAttribute("data-theme") === "light";
    var HEAVY = /\.part\d+(\?|#|$)|\/Build\/|\.(wasm|pck|data|unityweb|unx|zip|br|gz)(\?|#|$)/i;
    var loaded = 0, finished = false, unityPending = false, fullAt = 0;
    // data-no-open: porter credit buttons (gn-math / discord...) open nothing
    if (me.hasAttribute("data-no-open")) window.open = function () { return null; };

    var css = document.createElement("style");
    css.textContent =
        "#site-loading{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
        "background:" + (light ? "#fff" : "#000") + ";color:" + (light ? "#000" : "#fff") + ";font-family:cursive;text-align:center;transition:opacity .4s}" +
        "#site-loading #site-logo{display:flex;flex-direction:column;align-items:center;font-size:clamp(22px,4.5vw,52px);margin-bottom:18px}" +
        "#site-loading #site-logo img{max-width:60vw;max-height:26vh;object-fit:contain}" +
        "#site-loading .sl-text{font-size:clamp(24px,5vw,48px)}" +
        "#site-loading .sl-pct{font-size:clamp(20px,3.5vw,32px);margin-top:8px}" +
        "#site-loading .sl-note{font:14px Arial,Helvetica,sans-serif;opacity:.7;margin-top:8px;padding:0 16px}";
    document.head.appendChild(css);

    var ov = document.createElement("div");
    ov.id = "site-loading";
    ov.innerHTML = '<div id="site-logo"></div><div class="sl-text">LOADING...</div><div class="sl-pct">0%</div>' +
        '<div class="sl-note">' + (TOTAL > 50e6 ? "Loading game data (~" + Math.round(TOTAL / 1048576) + " MB)... the first load can take a few minutes." : "") + "</div>";
    var pctEl = ov.querySelector(".sl-pct"), noteEl = ov.querySelector(".sl-note");
    (function () {
        var box = ov.querySelector("#site-logo");
        var img = new Image();
        img.alt = "";
        img.onerror = function () { img.remove(); };
        if (/funny-school\.github\.io$/.test(location.hostname)) {
            img.src = "/assets/images/logohomepage.svg";
            box.appendChild(img);
            var name = document.createElement("div");
            name.textContent = "Funny School";
            box.appendChild(name);
        } else {
            img.src = "/assets/images/ubg88.png";
            box.appendChild(img);
        }
    })();
    document.documentElement.appendChild(ov);

    function render() {
        var p = TOTAL ? Math.max(0, Math.min(99, Math.floor(loaded / TOTAL * 100))) : 0;
        pctEl.textContent = p + "%";
        if (TOTAL && loaded >= TOTAL * 0.98) {
            if (!fullAt) fullAt = Date.now();
            noteEl.textContent = "Starting game...";
        }
    }
    function add(n) {
        loaded += n;
        if (!finished) render();
    }
    function finish() {
        if (finished) return;
        finished = true;
        ov.style.opacity = "0";
        setTimeout(function () { ov.remove(); css.remove(); }, 450);
    }
    function fail() {
        noteEl.textContent = "Loading failed - please refresh the page and try again.";
    }
    window.__siteLoading = { total: TOTAL, get loaded() { return loaded; }, get finished() { return finished; } };

    function counted(url, method) {
        if (method && String(method).toUpperCase() === "HEAD") return false;
        try {
            var u = new URL(url, location.href);
            return /^https?:$/.test(u.protocol) && u.origin === location.origin && HEAVY.test(u.pathname);
        } catch (e) { return false; }
    }

    // fetch: count body bytes as they stream in
    var ogFetch = window.fetch;
    window.fetch = function (input, init) {
        var url = typeof input === "string" ? input : (input && input.url) || String(input);
        var method = (init && init.method) || (input && input.method);
        var p = ogFetch.apply(this, arguments);
        if (!counted(url, method)) return p;
        return p.then(function (res) {
            if (!res.ok || !res.body) return res;
            var got = 0, reader = res.body.getReader();
            var stream = new ReadableStream({
                pull: function (c) {
                    return reader.read().then(function (r) {
                        if (r.done) return c.close();
                        got += r.value.length;
                        add(r.value.length);
                        c.enqueue(r.value);
                    }, function (e) {
                        add(-got); // that file starts over
                        got = 0;
                        c.error(e);
                    });
                },
                cancel: function (r) { return reader.cancel(r); }
            });
            var out = new Response(stream, { status: res.status, statusText: res.statusText, headers: res.headers });
            try { Object.defineProperty(out, "url", { value: res.url }); } catch (e) {}
            return out;
        });
    };

    // XHR: count progress events
    var ogOpen = XMLHttpRequest.prototype.open, ogSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
        this.__slCount = counted(String(url), method);
        return ogOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
        if (this.__slCount) {
            var last = 0;
            this.addEventListener("progress", function (e) { add(e.loaded - last); last = e.loaded; });
            this.addEventListener("load", function (e) { if (e.loaded > last) { add(e.loaded - last); last = e.loaded; } });
            this.addEventListener("error", function () { add(-last); last = 0; });
        }
        return ogSend.apply(this, arguments);
    };

    // Unity: stay until the instance is up
    function hookUnity() {
        var cui = window.createUnityInstance;
        if (typeof cui === "function" && !cui.__sl) {
            var wrapped = function () {
                unityPending = true;
                var pr = cui.apply(this, arguments);
                if (pr && pr.then) pr.then(finish, fail);
                return pr;
            };
            wrapped.__sl = true;
            window.createUnityInstance = wrapped;
        }
        var UL = window.UnityLoader;
        if (UL && typeof UL.instantiate === "function" && !UL.instantiate.__sl) {
            var inst = UL.instantiate;
            UL.instantiate = function (container, url, params) {
                unityPending = true;
                params = params || {};
                var M = params.Module = params.Module || {};
                var ori = M.onRuntimeInitialized;
                M.onRuntimeInitialized = function () {
                    finish();
                    if (ori) return ori.apply(this, arguments);
                };
                return inst.call(this, container, url, params);
            };
            UL.instantiate.__sl = true;
        }
    }
    // runs right after each <script src> executes, before the next script
    document.addEventListener("load", function (e) { if (e.target && e.target.tagName === "SCRIPT") hookUnity(); }, true);

    var seen = false;
    var timer = setInterval(function () {
        if (finished) return clearInterval(timer);
        hookUnity();
        var ready = false;
        if (DONE) {
            try { ready = !!eval(DONE); } catch (e) {}
        } else if (WATCH) {
            var el = document.querySelector(WATCH);
            if (el) seen = true;
            ready = seen && (!el || !el.isConnected || el.hidden || getComputedStyle(el).display === "none");
        }
        if (ready && !unityPending) finish();
        // safety net: everything downloaded long ago but no "ready" signal (missed hook) -> do not cover the game forever
        if (fullAt && Date.now() - fullAt > 45000 && (ready || !WATCH && !DONE)) finish();
    }, 200);
})();
