import { fork } from 'child_process';
import { join, dirname } from 'path';
import fs from 'fs-extra';
import logger from './utils/console.js';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const maxRetries = 3;
const retryDelay = 5000;

let isRunning = false;
let retryCount = 0;

function handleConnection(retry = 0) {
    const currentPath = process.cwd();
    const connectionFolder = join(currentPath, 'ملف_الاتصال');

    if (!fs.existsSync(connectionFolder)) {
        logger.warn('⚠️ No Session found, running anyway..');
    }

    if (isRunning) return;
    isRunning = true;
    logger.info('🛸 RUNNING...');

    const child = fork(join(__dirname, 'main.js'), [], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: {
            ...process.env,
            CONNECTION_FOLDER: connectionFolder
        }
    });

    child.on('message', (data) => {
        if (data === 'ready') {
            retryCount = 0;
            logger.success('✅ Bot started successfully!');
        } else if (data === 'reset') {
            logger.warn('🔄 Restarting bot by request...');
            child.kill();
            setTimeout(() => handleConnection(0), 2000);
        } else if (data === 'uptime') {
            child.send(process.uptime());
        }
    });

    child.on('exit', async (code) => {
        isRunning = false;

        if (code === 0) {
            logger.info('✅ Bot closed naturally.');
            return;
        }

        if (code === 429) {
            logger.warn('⚠️ Rate limit exceeded, waiting 10 seconds...');
            await delay(10000);
            return handleConnection(retry);
        }

        if (retry < maxRetries) {
            retry++;
            logger.warn(`⚠️ Restarting (${retry}/${maxRetries}) after ${retryDelay / 1000} seconds...`);
            await delay(retryDelay);
            handleConnection(retry);
        } else {
            logger.error('❌ Failed! Error.');
            process.exit(1);
        }
    });

    child.on('error', (err) => {
        isRunning = false;
        logger.error(`❌ Child process error: ${err}`);
        if (retry < maxRetries) {
            retry++;
            setTimeout(() => handleConnection(retry), retryDelay);
        }
    });

    setTimeout(() => {
        if (!child.connected) {
            logger.error('❌ Connection failed during timeout (10 seconds)');
            child.kill();
            handleConnection(retry + 1);
        }
    }, 10000);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

process.on('SIGINT', () => process.exit());

process.on('uncaughtException', (err) => {
    if (err.code === 'ECONNRESET' || err.code === 'rate-overlimit') {
        logger.warn('⚠️ Known error ignored.');
        return;
    }
    logger.error('❌ Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
    if (reason?.code === 429) {
        logger.warn('⚠️ Rate limit exceeded, waiting...');
        return;
    }
    logger.error('❌ Unhandled rejection:', reason);
});

logger.info('Anastasia Nova Ultra Ver 🪐🌀');
handleConnection();