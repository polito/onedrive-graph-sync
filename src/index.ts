#!/usr/bin/env node

// read in env settings
import 'dotenv/config';

import https from 'https';
import fs from 'fs';

import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
// eslint-disable-next-line import/extensions
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';

const { DRIVE_API_BASE, PARENT_FOLDER, OUT_PATH, TENANT_ID, CLIENT_ID, CLIENT_SECRET, DIFF_LIST } = process.env;

function download(url: string, path: string, mtime: Date) {
  return new Promise<void>((ok, no) => {
    const file = fs.createWriteStream(path);
    console.info('-> downloading', path);
    https.get(url, res => {
      console.info('--> starting');
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.info('--> finished');
        fs.utimesSync(path, new Date(), mtime);
        ok();
      });
    }).on('error', e => {
      fs.unlinkSync(path);
      console.error('--> failed!!');
      no(e);
    });
  });
}

class RemoteTree {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  public async traverse(
    cb: (item: any, path: string) => Promise<void>,
    ...pathPieces: string[]
  ) {
    const path = [PARENT_FOLDER, ...pathPieces].join('/');
    console.debug('querying', path);
    const res = await this.client
      .api(`${DRIVE_API_BASE}/root:/${path}:/children`)
      .get();
  
    if (typeof res.value[Symbol.iterator] !== 'function') return;
  
    for (const item of res.value) {
      await cb(item, path);
      if (item.folder) {
        await this.traverse(cb, ...pathPieces, item.name);
      }
    }
  }
}


class LocalTree {
  private tree = new Map<string, fs.Stats>();

  private traverse(...pathPieces: string[]) {
    const path = [...pathPieces].join('/');
    const lpath = [OUT_PATH, ...pathPieces].join('/');
    for (const item of fs.readdirSync(lpath)) {
      const stat = fs.statSync(`${lpath}/${item}`);
      this.tree.set(`${path}/${item}`, stat);
      if (stat.isDirectory()) {
        this.traverse(...pathPieces, item);
      }
    }
  }

  public constructor() {
    const base = `${OUT_PATH}/${PARENT_FOLDER}`;
    if (!fs.existsSync(base)) {
      fs.mkdirSync(base);
    }  
    this.traverse();
    this.tree.delete(`/${PARENT_FOLDER}`);
  }

  public get(path: string) {
    return this.tree.get(path);
  }

  public pop(path: string) {
    const stat = this.tree.get(path);
    if (stat) this.tree.delete(path);
    return stat || null;
  }

  public keys() {
    return [...this.tree.keys()];
  }
}

function emergencyDelete(lpath: string) {
  console.error('ENTRY TYPE CHANGED, DELETING AND QUITTING', lpath);
  fs.rmSync(lpath, { recursive: true });
  process.exit(1);
}

async function main() {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('missing auth data');
  }

  const client = Client.initWithMiddleware({
    authProvider: new TokenCredentialAuthenticationProvider(
      new ClientSecretCredential(TENANT_ID, CLIENT_ID, CLIENT_SECRET),
      { scopes: ['https://graph.microsoft.com/.default'] },
    ), 
  });

  const localTree = new LocalTree();
  const remoteTree = new RemoteTree(client);
  const diffFile = DIFF_LIST ? fs.createWriteStream(DIFF_LIST, 'utf8') : null;

  let nItems = 0;

  await remoteTree.traverse(async (item, path) => {
    nItems++;
    if (!item?.name) {
      console.error('!!! MISSING ITEM NAME', path);
      return;
    }
    const curPath = `${path}/${item.name}`;
    const lpath = `${OUT_PATH}/${curPath}`;
    console.debug('> processing', lpath);
    const stat = localTree.pop(curPath);
    if (item.file) {
      const lastMod = new Date(item.fileSystemInfo.lastModifiedDateTime);
      if (stat) {
        if (stat.isDirectory()) {
          emergencyDelete(lpath);
        } else if (stat.mtimeMs == lastMod.getTime()) {
          return; // all done here
        }
      }
      await download(item['@microsoft.graph.downloadUrl'], lpath, lastMod);
      diffFile?.write(`${lpath}\n`);
    } else if (item.folder) {
      if (stat) {
        if (stat.isDirectory()) {
          return; // all done here
        } else {
          emergencyDelete(lpath);
        }
      }
      fs.mkdirSync(lpath);
      console.info('-> created');
    } else {
      console.error('!!! UNEXPECTED ITEM TYPE', item.name, path);
    }
  });

  console.log(nItems, 'remote items processed');

  const remainst = localTree.keys().reverse(); // reversing is necessary to delete files inside dirs first and removing hopefully empty dirs afterwards
  for (const item of remainst) {
    const lpath = `${OUT_PATH}/${item}`;
    console.info('> deleting orphan', item);
    if (localTree.get(item)?.isDirectory()) {
      fs.rmdirSync(lpath);
    } else {
      fs.unlinkSync(lpath);
    }
  }
}

main().catch(console.error);
