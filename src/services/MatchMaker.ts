import { config } from "../config/env";
import logger from "../utils/logger";
import { Match } from "./Match";

export type Region = 'NA' | 'EU' | 'ASIA' | 'GLOBAL';

type QueuedPlayer = {
  id: string;
  socket: any; // or socket.io Socket type
  region: Region;
  enqueuedAt: number;
};


class Matchmaker {

  private matches: Match[] = [];
  
  private queues: Record<Region, QueuedPlayer[]> = {
    NA: [],
    EU: [],
    ASIA: [],
    GLOBAL: [],
  };

  private matchIdCounter = 0;

  constructor() {
    setInterval(() => this.tick(), 1000); // run every second
  }

  enqueuePlayer(player: QueuedPlayer) {
    const now = Date.now();

    // If the player waited too long in a region queue, move them to global
    if (player.region !== 'GLOBAL' && now - player.enqueuedAt >= config.regionalQueueTimeout) {
      this.removeFromRegion(player.id, player.region);
      player.region = 'GLOBAL';
      player.enqueuedAt = now;
      this.queues.GLOBAL.push(player);
      player.socket.emit('movedToGlobalQueue');
    } else {
      logger.info(`Adding player ${player.socket.id} to ${player.region} queue...`);
      this.queues[player.region].push(player);
      logger.info(`Player successfully added.. queue size is now ${this.queues[player.region].length}`);
    }
  }

  private removeFromRegion(playerId: string, region: Region) {
    this.queues[region] = this.queues[region].filter(p => p.id !== playerId);
  }

  private tick() {
    for (const region of Object.keys(this.queues) as Region[]) {
      const queue = this.queues[region];
      if (queue.length >= config.earlyStartMinPlayers) {
        // Start match early with 4+ players
        logger.info('early start, creating match...');
        this.createMatch(queue.splice(0, Math.min(config.maxPlayers, queue.length)), region);
      } else if (queue.length >= config.fallbackMinPlayers) {
        const oldest = queue[0];
        const now = Date.now();
        if (now - oldest.enqueuedAt >= config.fallbackStartTimeout) {
          // Final timeout reached, start with 2+ players
          logger.info('Fallback... creating match');
          this.createMatch(queue.splice(0, queue.length), region);
        }
      }
    }
  }

  private createMatch(players: QueuedPlayer[], region: Region) {
    const playerSockets = players.map((player) => player.socket);
    const matchId = `match-${++this.matchIdCounter}`; // TODO: Replace with better system if appropriate 
    const match = new Match(playerSockets, region, matchId);
    
    // Notify players
    for (const player of players) {
      logger.info(`Informing player ${player.socket.id} of the game start`);
      player.socket.join(matchId);
      player.socket.emit('matchFound', { matchId, region });
    };
    this.matches.push(match);


    console.log(`Match created: ${matchId} [${region}] with ${players.length} players`);
    // Store or manage match in a separate MatchManager if needed
  }
}

const matchMaker = new Matchmaker();
export default matchMaker;



