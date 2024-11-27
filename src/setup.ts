import { LabelerServer } from '@skyware/labeler';
import { AtpAgent, ComAtprotoLabelDefs } from '@atproto/api';
import { tags } from './tags.js';
import 'dotenv/config';
import { setLabelerLabelDefinitions } from '@skyware/labeler/scripts';
import { FeedViewPost } from '@atproto/api/dist/client/types/app/bsky/feed/defs.js';


const server = new LabelerServer({
  did: process.env.LABELER_DID!,
  signingKey: process.env.SIGNING_KEY!,
});

async function getPostCategory(authorFeed: FeedViewPost[], description: string, agent: AtpAgent) {
  
  if (authorFeed.length > 0) {
    // @ts-ignore
    let categoryPostExists = authorFeed.find((post) => post.post.record.text == description);

    if (categoryPostExists) {
      console.log('[C] Category Found: ' + description);
      return {
        uri: categoryPostExists.post.uri,
        cid: categoryPostExists.post.cid,
      };
    }
  }
  
  console.log('[C] New Category: ' + description);
  return await agent.post({
    text: description,
    createdAt: new Date().toISOString(),
  });
}

async function createLabel(
  agent: AtpAgent,
  authorFeed: FeedViewPost[],
  tag: any,
  categoryPost: any,
  parent: { uri: string; cid: string },
) {

  // @ts-ignore
  let authorFeed = agent.getAuthorFeed({
    actor: process.env.DID!,
    filter: ""
  })
  
  if (authorFeed.length > 0) {
    let labelExists = authorFeed?.find((post) => post.post.record.text.includes(tag.name));

    if (labelExists) {
      console.log('[L] Label Found: ' + tag.name);
      return {
        uri: labelExists.post.uri,
        cid: labelExists.post.cid,
      };
    } else {
      console.log("[L] Label doesn't exist: " + tag.name);
    }
  }
  
  console.log('[L] New Label: ' + tag.name);
  let post = await agent.post({
    text: tag.name + ' ->  ' + tag.description,
    createdAt: new Date().toISOString(),
    reply: {
      root: {
        uri: categoryPost.uri,
        cid: categoryPost.cid,
      },
      parent: parent,
    },
  });
  server.db.prepare('INSERT INTO labels_definitions (name, slug, description, uri, delete_trigger) VALUES (?, ?, ?, ?, ?);').run(tag.name, tag.slug, tag.description, post.uri, 0);
  return post;
}

const prepareDatabase = async (server: LabelerServer) => {// 
  server.db.prepare('DROP TABLE IF EXISTS labels_definitions;').run();
  server.db.prepare(
    'CREATE TABLE IF NOT EXISTS labels_definitions (name TEXT, slug TEXT PRIMARY KEY, description TEXT, uri TEXT, delete_trigger BOOLEAN);',
  ).run();

  const agent = new AtpAgent({
    service: 'https://bsky.social',
  });

  const loginCredentials = {
    identifier: process.env.DID!,
    password: process.env.BSKY_PASSWORD!,
  };

  await agent.login(loginCredentials);

  const labelDefinitions: ComAtprotoLabelDefs.LabelValueDefinition[] = [];

  let authorFeed = await agent.getAuthorFeed({
    actor: process.env.DID!,
    limit: 50,
  });

  for (const [_id, { description, values }] of Object.entries(tags)) {

    let categoryPost = await getPostCategory(authorFeed.data.feed, description, agent);

    if (description == tags.clearAll.description) {
      // @ts-ignore
      let clearExists = authorFeed.data.feed.find((post) => post.post.record.text == tags.clearAll.description);

      if (!clearExists) {
        server.db.prepare('INSERT INTO labels_definitions (name, slug, description, uri, delete_trigger) VALUES (?, ?, ?, ?, ?);')
          .run(description, 'clear', description, categoryPost.uri, 1);
      }
      break;
    }

    let parent = {
      uri: categoryPost.uri,
      cid: categoryPost.cid,
    };

    for (const tag of values) {
      
      let post = await createLabel(agent, authorFeed.data.feed, tag, categoryPost, parent);

      const labelValueDefinition: ComAtprotoLabelDefs.LabelValueDefinition = {
        identifier: tag.slug,
        severity: 'inform',
        blurs: 'none',
        defaultSetting: 'warn',
        adultOnly: false,
        locales: [
          {
            lang: 'en',
            name: tag.name,
            description: tag.description,
          },
        ],
      };

      labelDefinitions.push(labelValueDefinition);

      parent = {
        uri: post.uri,
        cid: post.cid,
      };
    }
  }

  await setLabelerLabelDefinitions(loginCredentials, labelDefinitions);
};

await prepareDatabase(server);
