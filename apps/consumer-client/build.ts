import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import { NodeModulesPolyfillPlugin } from "@esbuild-plugins/node-modules-polyfill";
import { build, BuildOptions, context } from "esbuild";
import fs from "fs";
import http from "node:http";

const consumerClientAppOpts: BuildOptions = {
  sourcemap: true,
  bundle: true,
  entryPoints: ["src/main.tsx"],
  plugins: [
    NodeModulesPolyfillPlugin(),
    NodeGlobalsPolyfillPlugin({
      process: true,
      buffer: true
    })
  ],
  loader: {
    ".svg": "dataurl"
  },
  outdir: "public/js",
  metafile: true
};

run(process.argv[2])
  .then(() => console.log("Built consumer client"))
  .catch((err) => console.error(err));

async function run(command: string) {
  switch (command) {
    case "build":
      const clientRes = await build({ ...consumerClientAppOpts, minify: true });
      console.error("Built", clientRes);

      // Bundle size data for use with https://esbuild.github.io/analyze/
      fs.writeFileSync(
        `${consumerClientAppOpts.outdir}/bundle-size.json`,
        JSON.stringify(clientRes.metafile)
      );

      break;
    case "dev":
      const ctx = await context(consumerClientAppOpts);
      await ctx.watch();

      const options = {
        host: "0.0.0.0",
        port: 3005,
        servedir: "public"
      };

      const { host, port } = await ctx.serve(options);
      const proxyPort = 3001;

      const proxy = http.createServer((req, res) => {
        // forwardRequest forwards an http request through to esbuid.
        const forwardRequest = (path) => {
          const options = {
            hostname: host,
            port,
            path,
            method: req.method,
            headers: req.headers
          };

          const proxyReq = http.request(options, (proxyRes) => {
            if (proxyRes.statusCode === 404) {
              // If esbuild 404s the request, assume it's a route needing to
              // be handled by the JS bundle, so forward a second attempt to `/`.
              return forwardRequest("/");
            }

            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res, { end: true });
          });

          req.pipe(proxyReq, { end: true });
        };

        // When we're called pass the request right through to esbuild.
        forwardRequest(req.url);
      });

      proxy.listen(proxyPort);

      console.log(`Serving consumer client on http://${host}:${port}`);
      break;
    default:
      throw new Error(`Unknown command ${command}`);
  }
}
