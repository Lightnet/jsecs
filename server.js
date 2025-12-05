// server.js
let PORT = 3000
Bun.serve({
  port: PORT,

  fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname;

    // === 1. Ignore noisy requests completely (recommended) ===
    const ignorePatterns = [
      "/favicon.ico",
      "/robots.txt",
      "/.well-known/",
      "/chrome-devtools/",
      "/devtools/",
      "/apple-touch-icon",
      "/safari-pinned-tab",
    ];

    if (ignorePatterns.some(pattern => pathname.startsWith(pattern))) {
      return new Response(null, { status: 204 }); // No Content – browsers stop asking
    }

    // === 2. Serve index.html on root ===
    if (pathname === "/" || pathname === "/index.html") {
      pathname = "/index.html";
    }

    // === 3. Security: block directory traversal ===
    if (pathname.includes("..") || pathname.includes("\\")) {
      return new Response("Forbidden", { status: 403 });
    }

    // === 4. Serve file from ./public ===
    const file = Bun.file(`./${pathname}`);

    // Check if file actually exists (this prevents ENOENT logs)
    if (!file.name || file.size === 0 && !file.type) {
      return new Response("Not Found", { status: 404 });
    }

    // === 5. Set correct Content-Type ===
    const ext = pathname.split(".").pop()?.toLowerCase() || "";
    const contentTypeMap = {
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      json: "application/json",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
      ico: "image/x-icon",
      webp: "image/webp",
      avif: "image/avif",
      wasm: "application/wasm",
      txt: "text/plain",
    };

    const contentType = contentTypeMap[ext] || "application/octet-stream";

    return new Response(file.stream(), {
      headers: {
        "Content-Type": contentType,
        // "Cache-Control": "public, max-age=3600",
        // "Cache-Control": "public, max-age=0",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  },

  // Optional: custom error handler (also suppresses logs)
  error(error) {
    // Silence ENOENT errors completely
    if (error.name === "ENOENT") {
      return new Response(null, { status: 204 });
    }
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  },
});

console.log(`Server running at http://127.0.0.1:${PORT}`);