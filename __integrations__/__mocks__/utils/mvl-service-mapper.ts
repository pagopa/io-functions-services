import { ILegalMessageMap } from "./legal-message";

export const FIXED_PEC_MAP: Record<string, ILegalMessageMap> = {
  "test@legal.it": { serviceId: "aValidServiceId" },
  "validServiceWithoutWriteMessageGroups@legal.it": {
    serviceId: "aValidServiceWithoutWriteMessageGroupsId"
  },
  "notExistingService@legal.it": { serviceId: "aNotExistingServiceId" },
  "aRaiseImpersonateError@legal.it": {
    serviceId: "aRaiseImpersonateErrorServiceId"
  }
};
