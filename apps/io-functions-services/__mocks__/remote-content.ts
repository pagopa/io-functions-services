import { HasPreconditionEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/HasPrecondition";
import { NonEmptyString, Ulid } from "@pagopa/ts-commons/lib/strings";

import { RCConfigurationResponse } from "../generated/messages-services-api/RCConfigurationResponse";

const aDetailAuthentication = {
  header_key_name: "a" as NonEmptyString,
  key: "key" as NonEmptyString,
  type: "type" as NonEmptyString
};

export const aRCConfigurationResponse: RCConfigurationResponse = {
  configuration_id: "01HQRD0YCVDXF1XDW634N87XCG" as Ulid,
  description: "a description" as NonEmptyString,
  disable_lollipop_for: [],
  has_precondition: HasPreconditionEnum.ALWAYS,
  is_lollipop_enabled: false,
  name: "aRemoteContentConfiguration" as NonEmptyString,
  prod_environment: {
    base_url: "aValidUrl" as NonEmptyString,
    details_authentication: aDetailAuthentication
  },
  user_id: "01234567890" as NonEmptyString
};
