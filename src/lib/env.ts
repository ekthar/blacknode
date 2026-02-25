function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  databaseUrl: getRequiredEnv("DATABASE_URL"),
  authJwtSecret: getRequiredEnv("AUTH_JWT_SECRET"),
  r2AccountId: getRequiredEnv("R2_ACCOUNT_ID"),
  r2AccessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
  r2SecretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
  r2BucketName: getRequiredEnv("R2_BUCKET_NAME"),
};
