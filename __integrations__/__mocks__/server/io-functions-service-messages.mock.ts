import { once } from "events";
import { createServer, Server } from "http";

export const startServer = async (
  port: number,
  mockGetRCConfiguration: jest.Mock
): Promise<Server> => {
  console.log("Creating server");
  const server = createServer((_, response) => {
    console.log("message", _.url);

    if (_.url?.startsWith("/remote-contents/configurations/"))
      mockGetRCConfiguration(response);
    else {
      response.statusCode = 500;
      response.end();
    }
  }).listen(port);

  await once(server, "listening");
  console.log("server created");

  return server;
};

export const closeServer = (server: Server): Promise<void> => {
  console.log("Closing server");

  return new Promise(done => server.close(done)).then(_ => void 0);
};
