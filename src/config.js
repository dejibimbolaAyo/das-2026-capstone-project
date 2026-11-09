const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid port number between 1 and 65535');
}

export const config = Object.freeze({
  port,
});