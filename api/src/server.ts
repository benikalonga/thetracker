import http from 'http';
import { createApp } from './app';
import { assertConfig, config } from './lib/config';
import { attachRealtime } from './lib/realtime';
import { startJobs } from './jobs';

assertConfig();
const server = http.createServer(createApp());
attachRealtime(server);
startJobs();
server.listen(config.port, () => console.log(`TheTracker API listening on :${config.port}`));
