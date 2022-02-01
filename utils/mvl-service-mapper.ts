import { ILegalMessageMap } from "./legal-message";

export const FIXED_PEC_MAP: Record<string, ILegalMessageMap> = {
  "certificati-anpr@pec.io.italia.poste.it": {
    serviceId: "01FBHRG29AHHRP42M3EHGZW55H"
  },
  "certificati-anpr@test.pec.io.italia.aruba.it": {
    serviceId: "01FBHRG29AHHRP42M3EHGZW55H"
  },
  "piattaforma-notifiche@pec.io.italia.poste.it": {
    serviceId: "01FBHR67HKNQG9JP3GPJEMGXV2"
  },
  "piattaforma-notifiche@test.pec.io.italia.aruba.it": {
    serviceId: "01FBHR67HKNQG9JP3GPJEMGXV2"
  },
  "protocollo-ipazia@pec.io.italia.poste.it": {
    serviceId: "01FM05GA5QXECVHV7D6E7EY8FW"
  },
  "protocollo-ipazia@test.pec.io.italia.aruba.it": {
    serviceId: "01FM05GA5QXECVHV7D6E7EY8FW"
  },
  "test@legal.it": { serviceId: "aValidServiceId" }
};
