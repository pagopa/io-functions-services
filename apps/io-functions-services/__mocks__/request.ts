/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * mockReq
 * @returns {{header, accepts, acceptsEncodings, acceptsEncoding, acceptsCharsets, acceptsCharset, acceptsLanguages, acceptsLanguage, range, param, is, reset: resetMock}}
 */

import { vi } from "vitest";

export default function mockReq(): any {
  const request = {
    accepts: vi.fn(),
    acceptsCharset: vi.fn(),
    acceptsCharsets: vi.fn(),
    acceptsEncoding: vi.fn(),
    acceptsEncodings: vi.fn(),
    acceptsLanguage: vi.fn(),
    acceptsLanguages: vi.fn(),
    app: {
      get: vi.fn()
    },
    body: {},
    contextMap: {},
    header: vi.fn(),
    headers: {},
    is: vi.fn(),
    param: vi.fn(),
    params: {},
    query: {},
    range: vi.fn(),
    reset: resetMock,
    setContext: vi.fn(),
    setHeaders: vi.fn()
  };

  request.header.mockImplementation(
    (headerName: string) => request.headers[headerName]
  );
  request.setContext.mockImplementation(
    context => (request.contextMap["context"] = context)
  );
  request.app.get.mockImplementation(
    identifier => request.contextMap[identifier]
  );
  request.setHeaders.mockImplementation(headers => (request.headers = headers));
  request.accepts.mockImplementation(() => request);
  request.acceptsEncodings.mockImplementation(() => request);
  request.acceptsEncoding.mockImplementation(() => request);
  request.acceptsCharsets.mockImplementation(() => request);
  request.acceptsCharset.mockImplementation(() => request);
  request.acceptsLanguages.mockImplementation(() => request);
  request.acceptsLanguage.mockImplementation(() => request);
  request.range.mockImplementation(() => request);
  request.param.mockImplementation(() => request);
  request.is.mockImplementation(() => request);

  return request;
}

/**
 * resetMock
 */
function resetMock(this: any): any {
  this.app.get.mockClear();
  this.setHeaders.mockClear();
  this.header.mockClear();
  this.accepts.mockClear();
  this.acceptsEncodings.mockClear();
  this.acceptsEncoding.mockClear();
  this.acceptsCharsets.mockClear();
  this.acceptsCharset.mockClear();
  this.acceptsLanguages.mockClear();
  this.acceptsLanguage.mockClear();
  this.range.mockClear();
  this.param.mockClear();
  this.is.mockClear();
}
