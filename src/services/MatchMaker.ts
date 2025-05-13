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
  private matches: Map<string, Match> = new Map();

  enqueuePlayer(player: QueuedPlayer) {
    // First try to find an existing match in the player's region
    const match = this.findMatchInRegion(player.region);

    if (match) {
      logger.info(`Adding player ${player.id} to existing match ${match.getId()} in region ${player.region}`);
      match.addPlayer(player.socket);
      player.socket.join(match.getId());
      player.socket.emit('matchFound', { 
        matchId: match.getId(), 
        region: player.region 
      });
    } else {
      // Create a new match if none exists in the region
      logger.info(`Creating new match for player ${player.id} in region ${player.region}`);
      const matchId = this.generateMatchId();
      const newMatch = new Match([player.socket], player.region, matchId, this.matches)
      this.matches.set(matchId, newMatch);
      player.socket.join(matchId);
      player.socket.emit('matchFound', { 
        matchId, 
        region: player.region 
      });
    }
  }

  private findMatchInRegion(region: Region): Match | null {
    for (const match of this.matches.values()) {
      if (match.getRegion() === region) {
        return match;
      }
    }
    return null;
  }

  private generateMatchId(): string {
    return `match-${Math.random().toString(36).substring(2, 8)}`;
  }

  removeMatch(matchId: string) {
    this.matches.delete(matchId);
    logger.info(`Match ${matchId} removed from matchmaker`);
  }

  getMatch(matchId: string): Match | undefined {
    return this.matches.get(matchId);
  }

  getActiveMatches(): Match[] {
    return Array.from(this.matches.values());
  }
}

const matchMaker = new Matchmaker();
export default matchMaker;