import { Either } from "fp-ts/lib/Either";
import { MailerConfig } from "../config";

const aMailFrom = "example@test.com";
const mailSecret = "a-mu-secret";
const mailUsername = "a-mu-username";
const devEnv = "dev";
const prodEnv = "production";

const noop = () => null;
const expectRight = <L, R>(e: Either<L, R>, t: (r: R) => void = noop) =>
  e.fold(
    _ =>
      fail(`Expecting right, received left. Value: ${JSON.stringify(e.value)}`),
    _ => t(_)
  );

const expectLeft = <L, R>(e: Either<L, R>, t: (l: L) => void = noop) =>
  e.fold(
    _ => t(_),
    _ =>
      fail(`Expecting left, received right. Value: ${JSON.stringify(e.value)}`)
  );

describe("MailerConfig", () => {
  it("should decode configuration for sendgrid", () => {
    const rawConf = {
      MAIL_FROM_DEFAULT: aMailFrom,
      NODE_ENV: prodEnv,
      SENDGRID_API_KEY: "a-sg-key"
    };
    const result = MailerConfig.decode(rawConf);

    expectRight(result, value => {
      expect(value.SENDGRID_API_KEY).toBe("a-sg-key");
      expect(typeof value.MAILUP_USERNAME).toBe("undefined");
    });
  });

  it("should decode configuration for sendgrid even if mailup conf is passed", () => {
    const rawConf = {
      MAILUP_SECRET: mailSecret,
      MAILUP_USERNAME: mailUsername,
      MAIL_FROM_DEFAULT: aMailFrom,
      NODE_ENV: prodEnv,
      SENDGRID_API_KEY: "a-sg-key"
    };
    const result = MailerConfig.decode(rawConf);

    expectRight(result, value => {
      expect(value.SENDGRID_API_KEY).toBe("a-sg-key");
    });
  });

  it("should decode configuration for mailup", () => {
    const rawConf = {
      MAILUP_SECRET: mailSecret,
      MAILUP_USERNAME: mailUsername,
      MAIL_FROM_DEFAULT: aMailFrom,
      NODE_ENV: prodEnv
    };
    const result = MailerConfig.decode(rawConf);

    expectRight(result, value => {
      expect(value.MAILUP_USERNAME).toBe("a-mu-username");
      expect(value.MAILUP_SECRET).toBe("a-mu-secret");
    });
  });

  it("should decode configuration with multi transport", () => {
    const aTransport = {
      password: "abc".repeat(5),
      transport: "transport-name",
      username: "t-username"
    };
    const aRawTrasport = [
      aTransport.transport,
      aTransport.username,
      aTransport.password
    ].join(":");

    const rawConf = {
      MAIL_FROM_DEFAULT: aMailFrom,
      MAIL_TRANSPORTS: [aRawTrasport, aRawTrasport].join(";"),
      NODE_ENV: prodEnv
    };
    const result = MailerConfig.decode(rawConf);

    expectRight(result, value => {
      expect(value.MAIL_TRANSPORTS).toEqual([aTransport, aTransport]);
    });
  });

  it("should decode configuration for mailhog", () => {
    const rawConf = {
      MAILHOG_HOSTNAME: "a-mh-host",
      MAIL_FROM_DEFAULT: aMailFrom,
      NODE_ENV: devEnv
    };
    const result = MailerConfig.decode(rawConf);

    expectRight(result, value => {
      expect(value.MAILHOG_HOSTNAME).toBe("a-mh-host");
    });
  });

  it("should require mailhog if not in prod", () => {
    const rawConf = {
      MAIL_FROM_DEFAULT: aMailFrom,
      NODE_ENV: devEnv
    };
    const result = MailerConfig.decode(rawConf);

    expectLeft(result);
  });

  it("should require at least on transporter if in prod", () => {
    const rawConf = {
      MAIL_FROM_DEFAULT: aMailFrom,
      NODE_ENV: prodEnv
    };
    const result = MailerConfig.decode(rawConf);

    expectLeft(result);
  });

  it("should not allow mailhog if in prod", () => {
    const rawConf = {
      MAILHOG_HOSTNAME: "a-mh-host",
      MAIL_FROM_DEFAULT: aMailFrom,
      NODE_ENV: prodEnv
    };
    const result = MailerConfig.decode(rawConf);

    expectLeft(result);
  });

  it("should not decode configuration with empty transport", () => {
    const rawConf = {
      MAIL_FROM_DEFAULT: aMailFrom,
      MAIL_TRANSPORTS: "",
      NODE_ENV: prodEnv
    };
    const result = MailerConfig.decode(rawConf);

    expectLeft(result);
  });

  it("should not decode configuration when no transporter is specified", () => {
    const rawConf = {
      MAIL_FROM_DEFAULT: aMailFrom
    };
    const result = MailerConfig.decode(rawConf);

    expectLeft(result);
  });

  it("should not decode ambiguos configuration", () => {
    const withMailUp = {
      MAILUP_SECRET: mailSecret,
      MAILUP_USERNAME: mailUsername
    };
    const withSendGrid = {
      SENDGRID_API_KEY: "a-sg-key"
    };
    const withMultiTransport = {
      MAIL_TRANSPORTS: "a-trasnport-name"
    };
    const base = {
      MAIL_FROM_DEFAULT: aMailFrom,
      NODE_ENV: prodEnv
    };

    // tslint:disable-next-line readonly-array
    const examples = [
      { ...base, ...withMultiTransport, ...withSendGrid },
      { ...base, ...withMailUp, ...withMultiTransport },
      { ...base, ...withMailUp, ...withSendGrid, ...withMultiTransport }
    ];

    examples.map(MailerConfig.decode).forEach(_ => expectLeft(_));
  });
});
