import {Path, File} from "runtime-compat/filesystem";
import crypto from "runtime-compat/crypto";
import {fulfill, flatten} from "htmt";

const last = -1;

const index_html = "index.html";
const preset = await new Path(import.meta.url).directory.join(index_html).file
  .read();

const getIndex = async env => {
  try {
    return await File.read(`${env.paths.static.join(index_html)}`);
  } catch (error) {
    return preset;
  }
};

const scriptPath = ["node_modules", "htmx.org", "dist", "htmx.min.js"];

const hash = async (string, algorithm = "sha-384") => {
  const buffer = new ArrayBuffer(string.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < string.length; i++) {
    view[i] = string.charCodeAt(i);
  }
  const bytes = await crypto.subtle.digest(algorithm, buffer);
  return Buffer.from(bytes).toString("base64");
};

export default (strings, ...keys) => async (env, headers) => {
  // if doesn't exist, copy htmx.js to public
  // if public doesn't exist, create it
  const _public = env.paths.public;
  if (!await _public.exists) {
    await _public.file.create();
  }
  const htmx = _public.join("htmx.js");
  if (!await htmx.exists) {
    await Path.resolve().join(...scriptPath).file.copy(`${htmx}`);
  }
  const src = "/htmx.js";
  const integrity = `sha384-${await hash(await htmx.file.read())}`;
  const script = `<script src="${src}" integrity="${integrity}"></script>`;
  const index = (await getIndex(env)).replace("</head>", `${script}</head>`);
  const {paths: {components: path}} = env;
  const loadFile = async file => [file.base, (await file.read())
    .replaceAll("\n", "")];
  const components = await path.exists
    ? Object.fromEntries(await Promise.all((
      await File.collect(`${path}`, ".html")).map(loadFile)))
    : {};
  const re = strings
    .slice(0, last)
    .map((string, i) => `${string}\${${i}}`)
    .join("") + strings[strings.length + last];
  const html = flatten(await fulfill(re, components, await Promise.all(keys)));
  const body = index.replace("<body>", () => `<body>${html}`);

  const script_src = `script-src 'self' '${integrity}';`;
  const style_src = "style-src 'unsafe-inline';";
  const csp = `${headers["Content-Security-Policy"]}${script_src}${style_src}`;
  const options = {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "text/html",
      "Content-Security-Policy": csp,
    },
  };

  // -> spread into new Response()
  return [body, options];
};
