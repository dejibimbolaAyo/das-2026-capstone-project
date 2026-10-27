const portValue = process.env.PORT;
export const PORT = portValue === undefined || portValue === '' ? 3000 : Number(portValue);

if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  throw new RangeError('PORT must be an integer between 0 and 65535');
}
