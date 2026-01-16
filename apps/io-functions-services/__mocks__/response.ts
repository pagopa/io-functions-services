/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from "vitest";

/**
 * mockRes
 * @returns {{append, attachment, cookie, clearCookie, download, end, format, get, json, jsonp, links, location, redirect, render, send, sendFile, sendStatus, set, status, type, vary, reset: resetMock}}
 */

export default function mockRes(): any {
  const response = {
    append: vi.fn(),
    attachment: vi.fn(),
    clearCookie: vi.fn(),
    cookie: vi.fn(),
    download: vi.fn(),
    end: vi.fn(),
    format: vi.fn(),
    get: vi.fn(),
    json: vi.fn(),
    jsonp: vi.fn(),
    links: vi.fn(),
    location: vi.fn(),
    redirect: vi.fn(),
    render: vi.fn(),
    reset: resetMock,
    send: vi.fn(),
    sendFile: vi.fn(),
    sendStatus: vi.fn(),
    set: vi.fn(),
    status: vi.fn(),
    type: vi.fn(),
    vary: vi.fn()
  };

  response.append.mockImplementation(() => response);
  response.attachment.mockImplementation(() => response);
  response.cookie.mockImplementation(() => response);
  response.clearCookie.mockImplementation(() => response);
  response.download.mockImplementation(() => response);
  response.end.mockImplementation(() => response);
  response.format.mockImplementation(() => response);
  response.get.mockImplementation(() => response);
  response.json.mockImplementation(() => response);
  response.jsonp.mockImplementation(() => response);
  response.links.mockImplementation(() => response);
  response.location.mockImplementation(() => response);
  response.redirect.mockImplementation(() => response);
  response.render.mockImplementation(() => response);
  response.send.mockImplementation(() => response);
  response.sendFile.mockImplementation(() => response);
  response.sendStatus.mockImplementation(() => response);
  response.links.mockImplementation(() => response);
  response.set.mockImplementation(() => response);
  response.status.mockImplementation(() => response);
  response.type.mockImplementation(() => response);
  response.vary.mockImplementation(() => response);

  return response;
}

/**
 * resetMock
 */
function resetMock(this: any): any {
  this.append.mockClear();
  this.attachment.mockClear();
  this.cookie.mockClear();
  this.clearCookie.mockClear();
  this.download.mockClear();
  this.end.mockClear();
  this.format.mockClear();
  this.get.mockClear();
  this.json.mockClear();
  this.jsonp.mockClear();
  this.links.mockClear();
  this.location.mockClear();
  this.redirect.mockClear();
  this.render.mockClear();
  this.send.mockClear();
  this.sendFile.mockClear();
  this.sendStatus.mockClear();
  this.links.mockClear();
  this.set.mockClear();
  this.status.mockClear();
  this.type.mockClear();
  this.vary.mockClear();
}
