const WebHookListener = require('twitch-webhooks').default;
const TwitchClient = require('twitch').default;
const fs = require('fs').promises; 
const { exec } = require("child_process");
const prompt = require('prompt-sync')({sigint: true});
const clientId = 'clientId';
const clientSecret = 'clientSecret';

let twitchClient;
let tokenData;
let user;
let userId;

async function authenticate() {
    tokenData = JSON.parse(await fs.readFile('./tokens.json', 'utf-8'));
    twitchClient = TwitchClient.withCredentials(clientId, tokenData.accessToken, undefined, {
        clientSecret,
        refreshToken: tokenData.refreshToken,
        expiry: tokenData.expiryTimestamp === null ? null : new Date(tokenData.expiryTimestamp),
        onRefresh: async ({ accessToken, refreshToken, expiryDate }) => {
            console.log('Token expired. Refreshing....')
            const newTokenData = {
                accessToken,
                refreshToken,
                expiryTimestamp: expiryDate === null ? null : expiryDate.getTime()
            };
            await fs.writeFile('./tokens.json', JSON.stringify(newTokenData, null, 4), 'UTF-8')
        }
    });
}

async function fetchUser() {
    let userName = prompt('Enter your Twitch username: ');
    user = await twitchClient.helix.users.getUserByName(userName);
    console.log(`Found user: ${user.id}`);
    userId = user.id;
}

async function main() {

    await authenticate();

    await fetchUser();

    //TODO: store list of current followers and persist. Prevent unfollow and re-follow causing shockage.

    console.log('starting webhook listener...');
    const listener = await WebHookListener.create(twitchClient, {port: 9020});
    listener.listen();    
    console.log('listener started.');
    
    console.log('subscribing to new follower events...');
    const follower = await listener.subscribeToFollowsToUser(userId, async (follow) => {
        if (follow) {
            console.log(`${follow.userDisplayName} zapped you with a follow!`);
            //TODO: activate and deactivate TENS unit.
        }
    });
    console.log('waiting for events...');

    process.on('SIGINT', () => {
        console.log('stopping webhook listeners..');
        follower.stop();
        //subscriber.stop();
        process.exit();
    });
}

main();