import fp from "fastify-plugin";
import { createClerkClient } from "@clerk/clerk-sdk-node";

export default fp(async function clerkAuth(fastify) {
  const { CLERK_SECRET_KEY, CLERK_JWT_ISSUER } = process.env;
  const AUTH_MOCK = process.env.AUTH_MOCK === "1";

  const clerk = CLERK_SECRET_KEY ? createClerkClient({ secretKey: CLERK_SECRET_KEY }) : null;

  fastify.decorate("requireAuth", async function (request: any, reply: any) {
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
      if (!clerk) {
        fastify.log.error("Clerk client not initialized");
        return reply.code(500).send({ error: "Auth configuration error" });
      }
      
      const options: any = {};
      if (CLERK_JWT_ISSUER && !CLERK_JWT_ISSUER.includes("YOUR_INSTANCE_ID")) {
        options.authorizedParties = [CLERK_JWT_ISSUER];
      }
      
      // Clerk verifyToken returns the decoded JWT payload
      const session = await clerk.verifyToken(token, options);
      
      // Extract user ID from various possible locations in the token
      const sub = (session as any)?.sub || 
                  (session as any)?.claims?.sub || 
                  (session as any)?.userId ||
                  (session as any)?.id;
      
      if (!sub) {
        fastify.log.warn({ 
          sessionKeys: Object.keys(session || {}),
          sessionSample: JSON.stringify(session).substring(0, 200)
        }, "No sub in session");
        return reply.code(401).send({ error: "Invalid token: no user ID" });
      }
      request.user = { id: String(sub) };
    } catch (e: any) {
      fastify.log.error({ error: e.message, stack: e.stack }, "Token verification failed");
      return reply.code(401).send({ error: "Invalid token", details: e.message });
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

