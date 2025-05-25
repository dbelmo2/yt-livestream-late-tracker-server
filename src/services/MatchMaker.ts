import { config } from "../config/env";
import logger from "../utils/logger";
import { Match } from "./Match";

export type Region = 'NA' | 'EU' | 'ASIA' | 'GLOBAL';


const BROADCAST_HZ = 20;                   // 50 ms
const FRAME_MS     = 1000 / BROADCAST_HZ;  // outer‑loop cadence


type QueuedPlayer = {
  id: string;
  socket: any; // or socket.io Socket type
  region: Region;
  enqueuedAt: number;
  name: string;
};

class Matchmaker {
  private matches: Map<string, Match>;
  private lastBroadcast: number = Date.now();
  
  constructor() {
    // Start the game loop
    this.matches = new Map<string, Match>();
    this.serverLoop();
  }


  public enqueuePlayer(player: QueuedPlayer) {
    // First try to find an existing match in the player's region
    const match = this.findMatchInRegion(player.region);

    if (match) {
      logger.info(`Adding player ${player.id} to existing match ${match.getId()} in region ${player.region}`);
      match.addPlayer(player.socket, player.name);
      player.socket.join(match.getId());
      player.socket.emit('matchFound', { 
        matchId: match.getId(), 
        region: player.region 
      });
    } else {
      // Create a new match if none exists in the region
      logger.info(`Creating new match for player ${player.id} in region ${player.region}`);
      const matchId = this.generateMatchId();
      const newMatch = new Match(player.socket, player.region, matchId, this.matches, player.name);
      this.matches.set(matchId, newMatch);
      player.socket.join(matchId);
      player.socket.emit('matchFound', { 
        matchId, 
        region: player.region 
      });
    }
  }

  public getMatch(matchId: string): Match | undefined {
    return this.matches.get(matchId);
  }

  public getActiveMatches(): Match[] {
    return Array.from(this.matches.values());
  }



  private serverLoop = () => {
    const now = Date.now();
    const delta = now - this.lastBroadcast;

    for (const match of this.matches.values()) {
      const shouldRemove = match.getShouldRemove();
      if (match.getIsReady() && shouldRemove === false) {
        // TODO: Consider passing delta here and using that for all Matches.
        match.update();
      } else if (shouldRemove) {
        match.cleanUpSession();
        this.removeMatch(match.getId());
      } else {
        logger.info(`Match ${match.getId()} is not ready yet`);
      }
    }

    // Broadcast snapshots at 20 Hz
    if (delta >= FRAME_MS) {
      for (const match of this.matches.values()) match.broadcastGameState();
      this.lastBroadcast = now;
    }

    // Wake up as soon as the event loop is idle
    setTimeout(this.serverLoop, 4);    
  }

  private findMatchInRegion(region: Region): Match | null {
    for (const match of this.matches.values()) {
      if (match.getRegion() === region && match.getNumberOfPlayers() < config.maxPlayers) {
        return match;
      }
    }
    return null;
  }

  private generateMatchId(): string {
    return `match-${Math.random().toString(36).substring(2, 8)}`;
  }

  private removeMatch(matchId: string) {
    this.matches.delete(matchId);
    logger.info(`Match ${matchId} removed from matchmaker`);
  }
}

const matchMaker = new Matchmaker();
export default matchMaker;