const WebHookListener = require('twitch-webhooks').default;
const TwitchClient = require('twitch').default;
const fs = require('fs').promises; 
const { exec } = require("child_process");
const prompt = require('prompt-sync')({sigint: true});
const clientId = 'clientId';
const clientSecret = 'clientSecret';

let twitchClient;
let jobQueue = [];
let jobIsProcessing = false;

async function authenticateTwitchClient() {
    const tokenData = JSON.parse(await fs.readFile('./tokens.json', 'utf-8'));
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
    return user;
}

async function fetchFollowers(user) {
    return await twitchClient.helix.users.getFollowsPaginated({followedUser: user.id}).getAll();
    //TODO: Should we persist first time run to a file?
    //await fs.writeFile('./follows.json', JSON.stringify(followsTo, null, 4), 'UTF-8');    
}

async function startListener() {
    console.log('starting webhook listener...');
    const listener = await WebHookListener.create(twitchClient, {port: 9020});
    listener.listen();    
    console.log('listener started.');
    return listener;
}

async function onNewFollowerEventReceived(follow, existingFollowers) {

    // if no params passed, check to see if queue has items to process
    if (follow === undefined) {
        if (jobQueue.length > 0) {
            let func = jobQueue.shift();
            func.call();
        }        
        return;
    }

    // if we're processing an item in the queue, add this call to the queue
    if (jobIsProcessing) {
        jobQueue.push(function() {
            onNewFollowerEventReceived(follow, existingFollowers)
        });
        return;
    }
    
    // we're not busy, so flag as busy and process this follow event
    jobIsProcessing = true;
    let existingFollower = existingFollowers.find(o => o.userId === follow.userId);            
    if (existingFollower) {
        console.log(`${follow.userDisplayName} re-followed. No zappage!`);
    } else {
        //TODO: activate and deactivate TENS unit.
        existingFollowers.push(follow);
        console.log(`${follow.userDisplayName} zapped you with a follow!`);
    } 
    await sleep(3000); // simulate waiting for zap
    jobIsProcessing = false;

    // call again with no params to check queue
    onNewFollowerEventReceived(); 
}

function sleep(ms) {
    console.log('waiting ' + ms / 1000 + ' seconds..');
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function main() {

    await authenticateTwitchClient();

    let user = await fetchUser();

    let existingFollowers = await fetchFollowers(user);

    const listener = await startListener();
    
    console.log('subscribing to new follower events...');

    const follower = await listener.subscribeToFollowsToUser(user.id, async(follow) => {
        onNewFollowerEventReceived(follow, existingFollowers);
    });

    console.log('waiting for events...');

    process.on('SIGINT', () => {
        console.log('stopping webhook listeners..');
        follower.stop();
        process.exit();
    });
}

main();