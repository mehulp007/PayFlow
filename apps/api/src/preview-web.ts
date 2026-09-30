import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

const webDirectory=resolve(dirname(fileURLToPath(import.meta.url)),'../../web/dist');

export async function registerPreviewWeb(app:FastifyInstance):Promise<void>{
  const indexPath=resolve(webDirectory,'index.html');
  await access(indexPath);
  app.get('/',async (_request,reply)=>{
    reply.header('cache-control','no-store').type('text/html; charset=utf-8');
    return readFile(indexPath);
  });
  app.get('/assets/*',async (request,reply)=>{
    const pathname=new URL(request.url,'http://localhost').pathname;
    if(!/^\/assets\/[a-zA-Z0-9._-]+\.(?:js|css)$/.test(pathname))
      return reply.code(404).send({error:'Asset not found'});
    const content=await readFile(resolve(webDirectory,pathname.slice(1))).catch(()=>null);
    if(!content)return reply.code(404).send({error:'Asset not found'});
    reply.header('cache-control','public, max-age=31536000, immutable')
      .type(pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');
    return content;
  });
}
