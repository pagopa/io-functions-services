/* eslint-disable @typescript-eslint/no-unused-vars */
import { CosmosClient, Database } from "@azure/cosmos";
import * as MessageCollection from "@pagopa/io-functions-commons/dist/src/models/message";
import * as MessageStatusCollection from "@pagopa/io-functions-commons/dist/src/models/message_status";
import * as NotificationCollection from "@pagopa/io-functions-commons/dist/src/models/notification";
import * as NotificationStatusCollection from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import * as ProfileCollection from "@pagopa/io-functions-commons/dist/src/models/profile";
import * as ServiceCollection from "@pagopa/io-functions-commons/dist/src/models/service";
import * as ServicePreferenceCollection from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { flow, pipe } from "fp-ts/lib/function";
import * as RA from "fp-ts/ReadonlyArray";
import * as TE from "fp-ts/TaskEither";

import {
  aValidProfileList,
  aValidServiceList,
  aValidServicePreferenceList
} from "./data/data";
import { createContainer, createDatabase } from "./utils/cosmos_utils";
import { log } from "./utils/logger";

const createServiceData = (db: Database) => {
  log("adding Service Data");

  return pipe(
    createContainer(
      db,
      ServiceCollection.SERVICE_COLLECTION_NAME,
      ServiceCollection.SERVICE_MODEL_PK_FIELD
    ),
    TE.map(c => new ServiceCollection.ServiceModel(c)),
    TE.chain(model =>
      pipe(
        aValidServiceList.map(aValidService =>
          pipe(
            model.create({
              kind: "INewService" as const,
              ...aValidService
            })
          )
        ),
        RA.sequence(TE.ApplicativePar)
      )
    ),
    TE.map(_ => log(`${_.length} Services data created`))
  );
};

const createMessageData = (db: Database) => {
  log("adding Message Data");

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
    TE.map(_ => log("Message data created"))
  );
};

const createProfileData = (db: Database) => {
  log("adding Profile Data");

  return pipe(
    createContainer(
      db,
      ProfileCollection.PROFILE_COLLECTION_NAME,
      ProfileCollection.PROFILE_MODEL_PK_FIELD
    ),
    TE.map(c => new ProfileCollection.ProfileModel(c)),
    TE.bindTo("profileModel"),
    TE.bind("profileCreated", ({ profileModel }) =>
      pipe(
        aValidProfileList.map(aValidProfile =>
          profileModel.create({
            kind: "INewProfile" as const,
            ...aValidProfile
          })
        ),
        RA.sequence(TE.ApplicativePar)
      )
    ),
    TE.map(_ => log(`${_.profileCreated.length} Profiles data created`))
  );
};

const createServicePreferencesData = (db: Database) => {
  log("adding Service Preferences Data");

  return pipe(
    createContainer(
      db,
      ServicePreferenceCollection.SERVICE_PREFERENCES_COLLECTION_NAME,
      ServicePreferenceCollection.SERVICE_PREFERENCES_MODEL_PK_FIELD
    ),
    TE.map(
      c =>
        new ServicePreferenceCollection.ServicesPreferencesModel(
          c,
          ServicePreferenceCollection.SERVICE_PREFERENCES_COLLECTION_NAME
        )
    ),
    TE.bindTo("model"),
    TE.bind("preferencesCreated", ({ model }) =>
      pipe(
        aValidServicePreferenceList.map(sp =>
          model.create({
            id: ServicePreferenceCollection.makeServicesPreferencesDocumentId(
              sp.fiscalCode,
              sp.serviceId,
              sp.settingsVersion
            ),
            kind: "INewServicePreference" as const,
            ...sp
          })
        ),
        RA.sequence(TE.ApplicativePar)
      )
    ),
    TE.map(_ =>
      log(`${_.preferencesCreated.length} ServicePreferences data created`)
    )
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
  log("filling CosmosDB");

  await pipe(
    new CosmosClient({
      endpoint: cosmosDbUri,
      key: cosmosDbKey
    }),
    TE.of,
    TE.chain(documentClient => createDatabase(documentClient, cosmosDbName)),
    TE.chain(
      flow(
        db => [
          createServiceData(db),
          createMessageData(db),
          createProfileData(db),
          createServicePreferencesData(db)
        ],
        RA.sequence(TE.ApplicativePar)
      )
    ),
    TE.mapLeft(_ => {
      log("Error");
      log(_);
    })
  )();
};
