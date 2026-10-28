import app from "../artifacts/api-server/src/app";

type FunctionRequest = {
  url?: string;
  [key: string]: unknown;
};

type FunctionResponse = {
  [key: string]: unknown;
};

export default function handler(req: FunctionRequest, res: FunctionResponse) {
  if (req.url && !req.url.startsWith("/api")) {
    req.url = `/api${req.url.startsWith("/") ? "" : "/"}${req.url}`;
  }

  return (app as unknown as (request: FunctionRequest, response: FunctionResponse) => unknown)(req, res);
}
