import { expect, test } from "vitest";
import { createServer as httpServer, get } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, preview } from "vite";

test("proxy mode forwards every path independently of the artifact preview", async () => {
  const requests: { path: string; origin?: string; referer?: string }[] = [];
  const redirects = new Map([["/redirect", "/orders.html?from=redirect"]]);
  const upstream = httpServer((request, response) => {
    requests.push({
      path: request.url!,
      origin: request.headers.origin,
      referer: request.headers.referer,
    });
    const location = redirects.get(request.url!);
    response
      .writeHead(location ? 302 : 200, {
        "content-type": "text/plain",
        "set-cookie":
          "session=synthetic; Domain=mobile.pinduoduo.com; Path=/; HttpOnly",
        ...(location ? { location } : {}),
      })
      .end("synthetic response");
  });
  const directory = await mkdtemp(join(tmpdir(), "pdd-preview-"));
  await writeFile(
    join(directory, "pdd-order-export.user.js"),
    "// synthetic userscript",
  );
  await new Promise<void>((done) => upstream.listen(0, "127.0.0.1", done));
  const target = "http://127.0.0.1:" + (upstream.address() as AddressInfo).port;
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  let artifactPreview: Awaited<ReturnType<typeof preview>> | undefined;
  try {
    artifactPreview = await preview({
      configFile: "vite.config.ts",
      mode: "test",
      logLevel: "silent",
      build: { outDir: directory },
      preview: { port: 0 },
    });
    server = await createServer({
      configFile: "vite.config.ts",
      mode: "proxy",
      logLevel: "silent",
      server: { port: 0, proxy: { "/": { target } } },
    });
    await server.listen();
    const base =
      "http://127.0.0.1:" + (server.httpServer!.address() as AddressInfo).port;
    const installBase =
      "http://127.0.0.1:" +
      (artifactPreview.httpServer.address() as AddressInfo).port;
    expect(
      (
        await fetch(base + "/orders.html", {
          headers: { Origin: "https://outside.invalid" },
        })
      ).status,
    ).toBe(403);
    const foreignHost = await new Promise<number | undefined>(
      (resolve, reject) => {
        get(
          base + "/orders.html",
          { headers: { Host: "outside.invalid" } },
          (response) => {
            response.resume();
            response.on("end", () => resolve(response.statusCode));
          },
        ).on("error", reject);
      },
    );
    expect(foreignHost).toBe(403);
    expect(requests).toHaveLength(0);
    expect(
      await (await fetch(installBase + "/pdd-order-export.user.js")).text(),
    ).toBe("// synthetic userscript");
    expect((await fetch(installBase + "/orders.html")).status).toBe(404);
    expect(requests).toHaveLength(0);
    const response = await fetch(base + "/proxy/api/orders?size=10", {
      headers: { Origin: base, Referer: base + "/orders.html" },
    });
    expect(await response.text()).toBe("synthetic response");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).not.toContain("Domain=");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(requests).toEqual([
      {
        path: "/proxy/api/orders?size=10",
        origin: target,
        referer: target + "/orders.html",
      },
    ]);
    const redirect = await fetch(base + "/redirect", {
      redirect: "manual",
    });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/orders.html?from=redirect");
    for (const [location, expected] of [
      ["login", "/account/login"],
      ["?step=2", "/account/verify?step=2"],
      [
        "https://outside.invalid/login?continue=1#done",
        "https://outside.invalid/login?continue=1#done",
      ],
    ] as const) {
      redirects.set("/account/verify?step=1", location);
      const response = await fetch(base + "/account/verify?step=1", {
        redirect: "manual",
      });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(expected);
    }
    expect(await (await fetch(base + "/orders.html")).text()).toBe(
      "synthetic response",
    );
    expect(await (await fetch(base + "/")).text()).toBe("synthetic response");
    expect(await (await fetch(base + "/pdd-order-export.user.js")).text()).toBe(
      "synthetic response",
    );
    expect(await (await fetch(base + "/src/pdd.ts")).text()).toBe(
      "synthetic response",
    );
    expect(requests.map((request) => request.path)).toEqual([
      "/proxy/api/orders?size=10",
      "/redirect",
      "/account/verify?step=1",
      "/account/verify?step=1",
      "/account/verify?step=1",
      "/orders.html",
      "/",
      "/pdd-order-export.user.js",
      "/src/pdd.ts",
    ]);
  } finally {
    await server?.close();
    if (artifactPreview)
      await new Promise<void>((done) =>
        artifactPreview!.httpServer.close(() => done()),
      );
    await new Promise<void>((done) => upstream.close(() => done()));
    if (!directory.startsWith(join(tmpdir(), "pdd-preview-")))
      throw new Error("Unexpected temporary directory");
    await rm(directory, { recursive: true, force: true });
  }
});
