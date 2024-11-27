import { AtpAgent } from '@atproto/api';
import 'dotenv/config';

const agent = new AtpAgent({
  service: 'https://bsky.social',
});

const loginCredentials = {
  identifier: process.env.DID!,
  password: process.env.BSKY_PASSWORD!,
};

await agent.login(loginCredentials);
//
const { data } = await agent.getAuthorFeed({
  actor: process.env.DID!,
});

const { feed: postsArray, cursor: _nextPage } = data;

if (postsArray.length > 0) {
  console.log('Deleting posts...');
  postsArray.forEach((post) => agent.deletePost(post.post.uri));
}
