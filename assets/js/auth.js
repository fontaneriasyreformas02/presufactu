/* =========================================================
   PresuFactu · Autenticación local con PIN
   ---------------------------------------------------------
   El PIN nunca se guarda en claro. Se deriva con PBKDF2-SHA256
   (Web Crypto) y una sal aleatoria. En navegadores sin
   crypto.subtle se usa un hash iterado de respaldo.
   ========================================================= */
(function () {
  "use strict";

  var AUTH_KEY = "presufactu.auth.v1";
  var SESSION_KEY = "presufactu.session.v1";
  var ITERATIONS = 150000;
  var FALLBACK_ITERATIONS = 20000;

  function b64FromBytes(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function bytesFromB64(b64) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function randomSalt() {
    var bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return b64FromBytes(bytes);
  }

  function fallbackHash(pin, saltB64, rounds) {
    var input = saltB64 + "|" + pin;
    var h1 = 0x811c9dc5;
    var h2 = 0x01000193;
    for (var r = 0; r < rounds; r++) {
      for (var i = 0; i < input.length; i++) {
        var c = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 16777619);
        h2 = Math.imul(h2 + c + r, 2246822519);
        h2 ^= h2 >>> 13;
      }
      h1 = Math.imul(h1 ^ h2, 2654435761);
      input = (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
    }
    return ("00000000" + (h1 >>> 0).toString(16)).slice(-8) +
           ("00000000" + (h2 >>> 0).toString(16)).slice(-8);
  }

  async function derivePin(pin, saltB64, iterations) {
    iterations = iterations || ITERATIONS;
    var encoder = new TextEncoder();
    if (window.crypto && window.crypto.subtle && window.isSecureContext !== false) {
      try {
        var salt = bytesFromB64(saltB64);
        var keyMaterial = await window.crypto.subtle.importKey(
          "raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]
        );
        var bits = await window.crypto.subtle.deriveBits(
          { name: "PBKDF2", salt: salt, iterations: iterations, hash: "SHA-256" },
          keyMaterial, 256
        );
        return "pbkdf2$" + b64FromBytes(new Uint8Array(bits));
      } catch (err) {
        /* continúa con el respaldo */
      }
    }
    return "fallback$" + fallbackHash(pin, saltB64, FALLBACK_ITERATIONS);
  }

  function safeEqual(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function readAuth() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeAuth(data) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(data));
  }

  function startSession(username) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        username: username,
        startedAt: Date.now(),
        lastActive: Date.now()
      }));
    } catch (err) { /* ignorar */ }
  }

  function readSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  var Auth = {
    isConfigured: function () {
      var auth = readAuth();
      return !!(auth && auth.hash && auth.salt);
    },

    getUser: function () {
      var auth = readAuth();
      return auth ? auth.username : "";
    },

    configure: async function (username, pin) {
      username = (username || "admin").trim() || "admin";
      var salt = randomSalt();
      var iterations = (window.crypto && window.crypto.subtle) ? ITERATIONS : FALLBACK_ITERATIONS;
      var hash = await derivePin(pin, salt, iterations);
      writeAuth({
        username: username,
        salt: salt,
        hash: hash,
        iterations: iterations,
        createdAt: new Date().toISOString()
      });
      startSession(username);
      return true;
    },

    login: async function (username, pin) {
      var auth = readAuth();
      if (!auth) return { ok: false, error: "No hay ningún acceso configurado." };
      if (auth.username && username && auth.username.toLowerCase() !== username.trim().toLowerCase()) {
        return { ok: false, error: "Usuario o PIN incorrectos." };
      }
      var hash = await derivePin(pin, auth.salt, auth.iterations);
      if (!safeEqual(hash, auth.hash)) {
        return { ok: false, error: "Usuario o PIN incorrectos." };
      }
      startSession(auth.username);
      return { ok: true };
    },

    isAuthenticated: function () {
      var session = readSession();
      if (!session) return false;
      // La sesión pertenece a la pestaña actual; caduca a las 12 h.
      if (Date.now() - session.startedAt > 12 * 60 * 60 * 1000) {
        this.logout();
        return false;
      }
      return true;
    },

    touch: function () {
      var session = readSession();
      if (!session) return;
      session.lastActive = Date.now();
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (err) { /* ignorar */ }
    },

    idleMinutes: function () {
      var session = readSession();
      if (!session) return 0;
      return (Date.now() - (session.lastActive || session.startedAt)) / 60000;
    },

    logout: function () {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (err) { /* ignorar */ }
    },

    changePin: async function (currentPin, newPin) {
      var auth = readAuth();
      if (!auth) return { ok: false, error: "No hay ningún acceso configurado." };
      var currentHash = await derivePin(currentPin, auth.salt, auth.iterations);
      if (!safeEqual(currentHash, auth.hash)) {
        return { ok: false, error: "El PIN actual no es correcto." };
      }
      var salt = randomSalt();
      var iterations = (window.crypto && window.crypto.subtle) ? ITERATIONS : FALLBACK_ITERATIONS;
      var hash = await derivePin(newPin, salt, iterations);
      writeAuth({
        username: auth.username,
        salt: salt,
        hash: hash,
        iterations: iterations,
        createdAt: auth.createdAt,
        updatedAt: new Date().toISOString()
      });
      return { ok: true };
    },

    changeUsername: function (username) {
      var auth = readAuth();
      if (!auth) return;
      auth.username = (username || "admin").trim() || "admin";
      writeAuth(auth);
    },

    /* Permite recuperar el acceso en este dispositivo sin borrar los datos.
       No es una recuperación criptográfica: la app es local y el PIN es una
       barrera de acceso, no cifrado de datos. */
    resetAccess: function () {
      localStorage.removeItem(AUTH_KEY);
      this.logout();
    },

    hasSession: function () {
      return !!readSession();
    }
  };

  window.Auth = Auth;
})();
