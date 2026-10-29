/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler = (req: any, res: any) => unknown;
type Route = { re: RegExp; keys: string[]; fn: Handler };

export type Request = any;
export type Response = any;

class RouterImpl {
  routes: Route[] = [];
  get(path: string, fn: Handler) {
    const keys: string[] = [];
    const src = path.replace(/:([A-Za-z]+)/g, (_m, k: string) => { keys.push(k); return '([^/]+)'; });
    this.routes.push({ re: new RegExp(`^${src}/?$`), keys, fn });
    return this;
  }
  use() { return this; }
  async handle(pathname: string, search: string): Promise<globalThis.Response | null> {
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      const query = Object.fromEntries(new URLSearchParams(search));
      const req = { query, params, log: { warn() {}, error() {}, info() {} } };
      return new Promise((resolve) => {
        let code = 200;
        const res: any = {
          status(c: number) { code = c; return res; },
          json(body: unknown) {
            resolve(new globalThis.Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } }));
          },
        };
        Promise.resolve(r.fn(req, res)).catch(() => {
          resolve(new globalThis.Response('{"error":"Server error"}', { status: 500, headers: { 'Content-Type': 'application/json' } }));
        });
      });
    }
    return null;
  }
}

export type IRouter = RouterImpl;
export function Router(): RouterImpl { return new RouterImpl(); }
