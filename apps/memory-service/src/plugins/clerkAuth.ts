import fp from "fastify-plugin";
import { createClerkClient } from "@clerk/clerk-sdk-node";

export default fp(async function clerkAuth(fastify) {
  const { CLERK_SECRET_KEY, CLERK_JWT_ISSUER } = process.env;
  const AUTH_MOCK = process.env.AUTH_MOCK === "1";

  const clerk = CLERK_SECRET_KEY ? createClerkClient({ secretKey: CLERK_SECRET_KEY }) : null;

  fastify.decorate("requireAuth", async function (request: any, reply: any) {
    // Allow internal service calls (from gateway) without auth
    // Check for internal IP or x-internal-service header
    const internalServiceHeader = request.headers['x-internal-service'];
    const userIdHeader = request.headers['x-user-id'];
    const isLocalhost = request.ip === '127.0.0.1' || request.ip === '::1' || request.ip?.startsWith('::ffff:127.0.0.1');
    
    // If from gateway (has x-internal-service header OR localhost) and has userId in header, trust it
    if ((internalServiceHeader === 'gateway' || isLocalhost) && userIdHeader) {
      request.user = { id: userIdHeader };
      return;
    }

    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing auth" });
    }
    const token = auth.slice(7);

    // In AUTH_MOCK mode, decode JWT without verification to extract user ID
    if (AUTH_MOCK) {
      try {
        // Decode JWT without verification (just parse the payload)
        const parts = token.split('.');
        if (parts.length !== 3) {
          request.user = { id: "user_dev_mock" };
          return;
        }
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        const sub = payload?.sub || payload?.userId || payload?.id;
        request.user = { id: sub || "user_dev_mock" };
      } catch {
        request.user = { id: "user_dev_mock" };
      }
      return;
    }

    try {
      const options: any = {};
      if (CLERK_JWT_ISSUER && !CLERK_JWT_ISSUER.includes("YOUR_INSTANCE_ID")) {
        options.authorizedParties = [CLERK_JWT_ISSUER];
      }
      const session = await clerk!.verifyToken(token, options);
      const sub = (session as any).sub || (session as any).claims?.sub;
      if (!sub) throw new Error("No sub");
      request.user = { id: sub };
    } catch (e) {
      return reply.code(401).send({ error: "Invalid token" });
    }
  });
});

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: (req: any, rep: any) => Promise<void>;
  }
  interface FastifyRequest {
    user?: { id: string };
  }
}

