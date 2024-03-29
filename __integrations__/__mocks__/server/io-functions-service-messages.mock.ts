import { once } from "events";
import { createServer, Server } from "http";

export const startServer = async (
  port: number,
  mockGetRCConfiguration: jest.Mock
): Promise<Server> => {
  console.log("Creating server");
  const server = createServer((_, response) => {
    console.log("remote-contents", _.url);
    if (
      _.url?.startsWith(
        "/service-messages/manage/api/v1/remote-contents/configurations/01HQRD0YCVDXF1XDW634N87XCG"
      )
    ) {
      console.log("matched call with existing configuration");
      mockGetRCConfiguration(response);
    } else if (
      _.url?.startsWith(
        "/service-messages/manage/api/v1/remote-contents/configurations/01HQRD0YCVDXF1XDW634N87XCF"
      )
    ) {
      console.log("matched call with not existing configuration");
      response.writeHead(404, { "Content-Type": "application/json" });
      response.statusCode = 404;
      response.end();
    } else {
      console.log("call not matched");
      response.writeHead(500, { "Content-Type": "application/json" });
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
