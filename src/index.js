export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "FileLab Hosting"
      });
    }

    if (url.pathname.startsWith("/api/")) {
      if (
        !env.DEPLOY_TOKEN ||
        request.headers.get("Authorization") !==
          `Bearer ${env.DEPLOY_TOKEN}`
      ) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }

      if (
        url.pathname === "/api/deploy" &&
        request.method === "POST"
      ) {
        const form = await request.formData();
        const name = String(form.get("name") || "").toLowerCase();
        const files = form.getAll("files").filter(
          file => file instanceof File
        );

        if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(name)) {
          return Response.json(
            { error: "Invalid site name" },
            { status: 400 }
          );
        }

        if (
          !files.length ||
          files.length > 100 ||
          files.some(file => file.size > 10 * 1024 * 1024) ||
          files.reduce((sum, file) => sum + file.size, 0) >
            50 * 1024 * 1024
        ) {
          return Response.json(
            { error: "Invalid files or upload size exceeded" },
            { status: 400 }
          );
        }

        if (!files.some(file =>
          file.name.replace(/\\/g, "/")
            .split("/").pop().toLowerCase() === "index.html"
        )) {
          return Response.json(
            { error: "Include index.html" },
            { status: 400 }
          );
        }

        const prefix = `sites/${name}/`;

        for (const file of files) {
          const path = file.name.replace(/\\/g, "/");

          if (
            path.startsWith("/") ||
            path.split("/").some(part =>
              !part || part === "." || part === ".."
            )
          ) {
            return Response.json(
              { error: "Invalid file path" },
              { status: 400 }
            );
          }

          await env.SITES.put(prefix + path, file.stream(), {
            httpMetadata: {
              contentType:
                file.type || "application/octet-stream"
            }
          });
        }

        return Response.json({
          ok: true,
          name,
          url: `${url.origin}/s/${name}/`
        });
      }

      return Response.json(
        { error: "Unknown API endpoint" },
        { status: 404 }
      );
    }

    const match = url.pathname.match(
      /^\/s\/([a-z0-9-]{1,48})\/(.*)$/
    );

    if (match && request.method === "GET") {
      const path = match[2] || "index.html";

      let decoded;
      try {
        decoded = decodeURIComponent(path);
      } catch {
        return new Response("Invalid path", { status: 400 });
      }

      if (decoded.split("/").some(part =>
        part === "." ||
        part === ".." ||
        part.startsWith(".") ||
        part.includes("\\")
      )) {
        return new Response("Not found", { status: 404 });
      }

      const file = await env.SITES.get(
        `sites/${match[1]}/${decoded}`
      );

      if (!file) {
        return new Response("Not found", { status: 404 });
      }

      return new Response(file.body, {
        headers: file.httpMetadata
      });
    }

    return new Response(
      "FileLab Hosting Worker is running."
    );
  }
};
