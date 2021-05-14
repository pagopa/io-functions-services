// tslint:disable: no-any

import { Context } from "@azure/functions";
import * as df from "durable-functions";

export const mockStatusRunning = {
  runtimeStatus: df.OrchestrationRuntimeStatus.Running
};
export const mockStatusCompleted = {
  runtimeStatus: df.OrchestrationRuntimeStatus.Completed
};

export const OrchestrationRuntimeStatus = df.OrchestrationRuntimeStatus;

export const mockStartNew = jest.fn((_, __, ___) =>
  Promise.resolve("instanceId")
);
export const mockGetStatus = jest
  .fn()
  .mockImplementation(async () => mockStatusCompleted);
export const mockTerminate = jest.fn(async (_, __) => {
  return;
});

export const mockRaiseEvent = jest.fn().mockImplementation(async () => void 0);

export const getClient = jest.fn().mockImplementation(() => ({
  getStatus: mockGetStatus,
  raiseEvent: mockRaiseEvent,
  startNew: mockStartNew,
  terminate: mockTerminate
}));

export const RetryOptions = jest.fn(() => ({}));

export const context = ({
  bindings: {},
  log: {
    // tslint:disable-next-line: no-console
    error: jest.fn().mockImplementation(console.log),
    // tslint:disable-next-line: no-console
    info: jest.fn().mockImplementation(console.log),
    // tslint:disable-next-line: no-console
    verbose: jest.fn().mockImplementation(console.log),
    // tslint:disable-next-line: no-console
    warn: jest.fn().mockImplementation(console.log)
  }
} as any) as Context;

//
// Orchestrator context
//

export const mockOrchestratorGetInput = jest.fn();
export const mockOrchestratorCallActivity = jest
  .fn()
  .mockImplementation((name: string, input?: unknown) => ({
    input,
    name
  }));
export const mockOrchestratorCallActivityWithRetry = jest
  .fn()
  .mockImplementation(
    (name: string, retryOptions: df.RetryOptions, input?: unknown) => ({
      input,
      name,
      retryOptions
    })
  );
export const mockCallSubOrchestrator = jest
  .fn()
  .mockImplementation((name: string, input?: unknown) => ({
    input,
    name
  }));
export const mockOrchestratorSetCustomStatus = jest.fn();
export const mockOrchestratorCancelTimer = jest.fn();
export const mockOrchestratorCreateTimer = () => ({
  cancel: mockOrchestratorCancelTimer
});
export const mockWaitForExternalEvent = jest
  .fn()
  .mockReturnValue("mockWaitForExternalEvent");

export const mockOrchestratorTaskAny = jest
  .fn()
  // mock implementation: return the first task
  .mockImplementation(([_]) => _);

export const mockOrchestratorContext = {
  ...context,
  df: {
    Task: {
      all: jest.fn(),
      any: mockOrchestratorTaskAny
    },
    callActivity: mockOrchestratorCallActivity,
    callActivityWithRetry: mockOrchestratorCallActivityWithRetry,
    callSubOrchestrator: mockCallSubOrchestrator,
    createTimer: mockOrchestratorCreateTimer,
    currentUtcDateTime: new Date(),
    getClient,
    getInput: mockOrchestratorGetInput,
    setCustomStatus: mockOrchestratorSetCustomStatus,
    waitForExternalEvent: mockWaitForExternalEvent
  }
};

export const orchestrator = jest
  .fn()
  .mockImplementation(fn => () => fn(mockOrchestratorContext));
