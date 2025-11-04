import { vi, describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from './image';
import * as gemini from '../../../server/google/gemini';
import * as serverAuth from '@clerk/nextjs/server';

vi.mock('../../../server/google/gemini');
vi.mock('@clerk/nextjs/server', () => ({
    getAuth: vi.fn(),
}));

global.fetch = vi.fn();

describe.todo('/api/artifacts/image API Route', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        vi.resetAllMocks();
        process.env = { ...OLD_ENV, IMAGE_GEN_ENABLED: 'true', VITE_API_BASE_URL: 'http://localhost:3000' };
        (serverAuth.getAuth as vi.Mock).mockReturnValue({ getToken: () => Promise.resolve('test-token') });
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('should return 405 if method is not POST', async () => {
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(405);
    });

    it('should return 403 if image generation is disabled', async () => {
        process.env.IMAGE_GEN_ENABLED = 'false';
        const { req, res } = createMocks({ method: 'POST', body: { threadId: 't1', prompt: 'p1' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(403);
    });

    it('should return 400 if threadId or prompt is missing', async () => {
        const { req, res } = createMocks({ method: 'POST', body: { threadId: 't1' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(400);

        const { req: req2, res: res2 } = createMocks({ method: 'POST', body: { prompt: 'p1' } });
        await handler(req2, res2);
        expect(res2._getStatusCode()).toBe(400);
    });

    it('should return 401 if user is not authenticated', async () => {
        (serverAuth.getAuth as vi.Mock).mockReturnValue({ getToken: () => Promise.resolve(null) });
        const { req, res } = createMocks({ method: 'POST', body: { threadId: 't1', prompt: 'p1' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(401);
    });

    it('should successfully generate an image and create an artifact', async () => {
        const mockImages = [{ mime: 'image/png', dataUrl: 'data:...' }];
        (gemini.generateImage as vi.Mock).mockResolvedValue(mockImages);

        const mockArtifact = { id: 'artifact123' };
        (fetch as vi.Mock).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockArtifact),
        });

        const { req, res } = createMocks({
            method: 'POST',
            body: { threadId: 't1', prompt: 'a cat', size: '1024x1024' },
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
        expect(res._getJSONData()).toEqual({ artifactId: 'artifact123' });
        expect(gemini.generateImage).toHaveBeenCalledWith('a cat', { size: '1024x1024' });
        expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/artifacts/create', expect.any(Object));
    });

    it('should handle failure in image generation', async () => {
        (gemini.generateImage as vi.Mock).mockRejectedValue(new Error('Gen fail'));
        const { req, res } = createMocks({ method: 'POST', body: { threadId: 't1', prompt: 'p1' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(500);
        expect(res._getJSONData().error).toContain('Internal server error');
    });

    it('should handle failure in artifact creation', async () => {
        const mockImages = [{ mime: 'image/png', dataUrl: 'data:...' }];
        (gemini.generateImage as vi.Mock).mockResolvedValue(mockImages);
        (fetch as vi.Mock).mockResolvedValue({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Gateway error'),
        });
        const { req, res } = createMocks({ method: 'POST', body: { threadId: 't1', prompt: 'p1' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(500);
        expect(res._getJSONData().error).toContain('Failed to save artifact');
    });
});
