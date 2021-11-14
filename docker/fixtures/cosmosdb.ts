/* eslint-disable sort-keys */
import * as TE from "fp-ts/TaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as ServiceCollection from "@pagopa/io-functions-commons/dist/src/models/service";
import * as ProfileCollection from "@pagopa/io-functions-commons/dist/src/models/profile";
import * as MessageCollection from "@pagopa/io-functions-commons/dist/src/models/message";
import * as MessageStatusCollection from "@pagopa/io-functions-commons/dist/src/models/message_status";
import * as NotificationCollection from "@pagopa/io-functions-commons/dist/src/models/notification";
import * as NotificationStatusCollection from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import { CosmosClient, Database } from "@azure/cosmos";
import { flow, pipe } from "fp-ts/lib/function";
import {
  EmailString,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";
import { CIDR } from "@pagopa/io-functions-commons/dist/generated/definitions/CIDR";
import { WithinRangeInteger } from "@pagopa/ts-commons/lib/numbers";
import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";
import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { StandardServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/StandardServiceCategory";
import { ServicesPreferencesModeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServicesPreferencesMode";
import { createContainer, createDatabase } from "./utils/cosmos_utils";

export const aFiscalCode = "AAABBB01C02D345D" as FiscalCode;
export const anotherFiscalCode = "AAABBB01C02D345W" as FiscalCode;

export const aValidService: ServiceCollection.ValidService = {
  serviceId: "aServiceId" as NonEmptyString,
  authorizedRecipients: new Set([aFiscalCode, anotherFiscalCode]),
  authorizedCIDRs: new Set((["0.0.0.0"] as unknown) as ReadonlyArray<CIDR>),
  departmentName: "department" as NonEmptyString,
  isVisible: true,
  maxAllowedPaymentAmount: (0 as unknown) as number &
    WithinRangeInteger<0, 9999999999>,
  organizationFiscalCode: "01234567890" as OrganizationFiscalCode,
  organizationName: "Organization" as NonEmptyString,
  requireSecureChannels: true,
  serviceName: "Service" as NonEmptyString,
  serviceMetadata: {
    description: "Service Description" as NonEmptyString,
    privacyUrl: "https://example.com/privacy.html" as NonEmptyString,
    supportUrl: "https://example.com/support.html" as NonEmptyString,
    scope: ServiceScopeEnum.NATIONAL,
    category: StandardServiceCategoryEnum.STANDARD,
    customSpecialFlow: undefined
  }
};

const aValidProfile: ProfileCollection.Profile = {
  acceptedTosVersion: 2,
  email: "fake-email@fake.it" as EmailString,
  fiscalCode: aFiscalCode,
  isEmailEnabled: true,
  isEmailValidated: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  blockedInboxOrChannels: {},
  servicePreferencesSettings: {
    mode: ServicesPreferencesModeEnum.LEGACY,
    version:
      ProfileCollection.PROFILE_SERVICE_PREFERENCES_SETTINGS_LEGACY_VERSION
  }
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const createServiceData = (db: Database) => {
  console.log("adding Service Data");

  return pipe(
    createContainer(
      db,
      ServiceCollection.SERVICE_COLLECTION_NAME,
      ServiceCollection.SERVICE_MODEL_PK_FIELD
    ),
    TE.map(c => new ServiceCollection.ServiceModel(c)),
    TE.chainW(model => {
      const newDoc = {
        kind: "INewService" as const,
        ...aValidService
      };

      return model.create(newDoc);
    }),
    TE.map(_ => console.log("Service data created"))
  );
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const createMessageData = (db: Database) => {
  console.log("adding Message Data");

  return pipe(
    [
      createContainer(
        db,
        MessageCollection.MESSAGE_COLLECTION_NAME,
        MessageCollection.MESSAGE_MODEL_PK_FIELD
      ),
      createContainer(
        db,
        MessageStatusCollection.MESSAGE_STATUS_COLLECTION_NAME,
        MessageStatusCollection.MESSAGE_STATUS_MODEL_PK_FIELD
      ),
      createContainer(
        db,
        NotificationCollection.NOTIFICATION_COLLECTION_NAME,
        NotificationCollection.NOTIFICATION_MODEL_PK_FIELD
      ),
      createContainer(
        db,
        NotificationStatusCollection.NOTIFICATION_STATUS_COLLECTION_NAME,
        NotificationStatusCollection.NOTIFICATION_STATUS_MODEL_PK_FIELD
      )
    ],
    RA.sequence(TE.ApplicativePar),
    TE.map(_ => console.log("Message data created"))
  );
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const createProfileData = (db: Database) => {
  console.log("adding Profile Data");

  return pipe(
    createContainer(
      db,
      ProfileCollection.PROFILE_COLLECTION_NAME,
      ProfileCollection.PROFILE_MODEL_PK_FIELD
    ),
    TE.map(c => new ProfileCollection.ProfileModel(c)),
    TE.bindTo("profileModel"),
    TE.bind("profileCreated", ({ profileModel }) => {
      const newDoc = {
        kind: "INewProfile" as const,
        ...aValidProfile
      };
      return profileModel.create(newDoc);
    }),
    TE.map(_ => console.log("Profile data created"))
  );
};

/**
 * Fill DB
 */
export const fillCosmosDb = async (
  cosmosDbUri: string,
  cosmosDbKey: string,
  cosmosDbName: string
): Promise<void> => {
  console.log("filling CosmosDB");

  await pipe(
    new CosmosClient({
      endpoint: cosmosDbUri,
      key: cosmosDbKey
    }),
    TE.of,
    TE.chain(documentClient => createDatabase(documentClient, cosmosDbName)),
    TE.chainFirst(
      flow(
        db => [
          createServiceData(db),
          createMessageData(db),
          createProfileData(db)
        ],
        RA.sequence(TE.ApplicativePar)
      )
    ),
    TE.mapLeft(_ => {
      console.log("Error");
      console.log(_);
      throw _;
    })
  )();
};
