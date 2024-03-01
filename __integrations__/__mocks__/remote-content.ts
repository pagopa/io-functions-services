import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { HasPreconditionEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/HasPrecondition";

const aDetailAuthentication = {
  header_key_name: "a" as NonEmptyString,
  key: "key" as NonEmptyString,
  type: "type" as NonEmptyString
};

export const aRCConfigurationResponse = {
  has_precondition: HasPreconditionEnum.ALWAYS,
  disable_lollipop_for: [],
  is_lollipop_enabled: false,
  configuration_id: "01HQRD0YCVDXF1XDW634N87XCG",
  user_id: "01234567890",
  name: "aRemoteContentConfiguration",
  description: "a description",
  prod_environment: {
    base_url: "aValidUrl",
    details_authentication: aDetailAuthentication
  }
};
