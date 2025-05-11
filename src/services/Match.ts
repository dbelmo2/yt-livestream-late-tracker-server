import { Socket } from 'socket.io';
import { Projectile } from '../game-logic/Projectile';
import logger from '../utils/logger';
import { 
  testForAABB,
  PROJECTILE_WIDTH,
  PROJECTILE_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_HEIGHT
} from '../game-logic/collision';
import { set } from 'mongoose';
import test from 'node:test';
import { kill } from 'process';


type Region = 'NA' | 'EU' | 'ASIA' | 'GLOBAL';
type GamePhase = 'initializing' | 'ready' | 'active' | 'ended';


export type PlayerState = {
  id: string;
  x: number;
  y: number;
  hp: number;
};

export type ProjectileState = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
};

export type PlayerScore = {
  kills: number;
  deaths: number;
};

const MAX_KILL_AMOUNT = 2; // Adjust this value as needed


// TODO: 
//  1. Address Y coordinate mismatch between client and server
//  2. Address height mismatch between client and server (probably due to health bar)

export class Match {
  private id: string;
  private players: Map<string, PlayerState> = new Map();
  private projectiles: Projectile[] = [];
  private interval: NodeJS.Timeout | null = null;
  private projectileStates: ProjectileState[] = [];
  private timeoutIds: Set<NodeJS.Timeout> = new Set();
  private startingX = 100;
  private startingY = 100;
  private totalCollisions = 0;
  private playerScores: Map<string, PlayerScore> = new Map();
  private gamePhase: GamePhase = 'initializing';
  private readyPlayers: Set<string> = new Set();
  private sockets: Socket[] = [];
  private region: Region;
  constructor(
    sockets: Socket[],
    region: Region,
    id = `match-${Math.random().toString(36).substring(2, 8)}`
  ) {
    this.id = id;
    this.sockets = sockets;
    this.region = region;

    this.initalizePlayerData(sockets);
    this.setUpPlayerSocketHandlers(sockets);
    // Start game loop loop (this will broadcast the game state to all players)
    this.interval = setInterval(() => this.update(), 1000 / 60); 
    this.gamePhase = 'ready';

    // Once setup is complete, inform players
    this.informPlayersMatchSetupComplete();
  }


  private initalizePlayerData(sockets: Socket[]) {
    for (const socket of sockets) {
      // Setup player state
      this.players.set(socket.id, {
        id: socket.id,
        x: this.startingX,
        y: this.startingY,
        hp: 100,
      });

      // Initialize player scores
      this.playerScores.set(socket.id, {
        kills: 0,
        deaths: 0,
      });
    }
  }

  private setUpPlayerSocketHandlers(sockets: Socket[]) {
    for (const socket of sockets) {
      socket.on('playerReady', () => this.handlePlayerReady(socket.id));
      socket.on('playerInput', ({ x, y }) => this.handlePlayerInput(socket.id, x, y));
      socket.on('shoot', ({ x, y, id }) => this.handlePlayerShooting(socket.id, id, x, y));
      socket.on('disconnect', () => this.handlePlayerDisconnect(socket.id));
    }
  }

  private handlePlayerReady(playerId: string) {
    this.readyPlayers.add(playerId);
    if (this.readyPlayers.size === this.sockets.length) {
      logger.info(`All players are ready, starting match...`);
      this.startMatch();
    } else {
      // Notify all players of ready status
      const readyCount = this.readyPlayers.size;
      const totalPlayers = this.sockets.length;
      for (const socket of this.sockets) {
        socket.emit('readyUpdate', { ready: readyCount, total: totalPlayers });
      }
    }
  }

  private informPlayersMatchSetupComplete() {
    for (const socket of this.sockets) {
      socket.emit('setupComplete');
    }
  }

  private startMatch() {
    this.gamePhase = 'active';
    this.readyPlayers.clear();
    for (const socket of this.sockets) {
      socket.emit('matchStart', {
          players: Array.from(this.players.values()),
          scores: Array.from(this.playerScores.entries())
            .map(([playerId, score]) => ({
              playerId,
              ...score
            }))
      });
    }
  }


  private checkWinCondition() {
    const sortedScores = Array.from(this.playerScores.entries())
      .map(([playerId, score]) => ({
        playerId,
        ...score
      }))
      .sort((a, b) => b.kills - a.kills);

    const winner = sortedScores[0];
    
    if (winner && winner.kills >= MAX_KILL_AMOUNT) {
      // Emit game over event with sorted scores
      this.gamePhase = 'ended';
      for (const socket of this.sockets) {
        socket.emit('gameOver', sortedScores);
      }
      
      // Clean up the match
      this.cleanup();
    }
  }

  private update() {
    if (this.gamePhase === 'ended') return;
    const projectilesToRemove: number[] = [];

    for (let i = 0; i < this.projectiles.length; i++) {
      const projectile = this.projectiles[i];
      projectile.update();
  
      // Check expired projectiles
      if (projectile.shouldBeDestroyed) {
        projectilesToRemove.push(i);
        continue;
      }
  
      // Check for collisions
      let collided = false;
      for (const player of this.players.values()) {
        if (projectile.getOwnerId() === player.id) continue;
        // TODO: Print victim location here for first projectile to compare with client data.
        const projectileRect = {
          x: projectile.getX() - PROJECTILE_WIDTH / 2,
          y: projectile.getY() - PROJECTILE_HEIGHT / 2,
          width: PROJECTILE_WIDTH,
          height: PROJECTILE_HEIGHT,
        };
  
        const playerRect = {
          x: player.x - PLAYER_WIDTH / 2,
          y: player.y - PLAYER_HEIGHT,
          width: PLAYER_WIDTH,
          height: PLAYER_HEIGHT,
        };
  
        collided = testForAABB(projectileRect, playerRect);
        if (collided) {
          projectilesToRemove.push(i);
          this.handleCollision(projectile, player);
          break;
        }
      }
      
      // Collect projectile state for broadcast
      if (!collided) {
        this.projectileStates.push({
          ownerId: projectile.getOwnerId(),
          id: projectile.getId(),
          x: projectile.getX(),
          y: projectile.getY(),
          vx: projectile.getVX(),
          vy: projectile.getVY(),
        });
      }
    }

    // Remove projectiles after all processing is done
    // Remove from end to start to maintain correct indices
    for (let i = projectilesToRemove.length - 1; i >= 0; i--) {
      this.projectiles.splice(projectilesToRemove[i], 1);
    }


    // Broadcast the game state to all players
    const gameState = {
      players: Array.from(this.players.values()),
      projectiles: this.projectileStates,
      scores: Array.from(this.playerScores.entries()).map(([playerId, score]) => ({
        playerId,
        ...score
      }))
    };
  
    for (const socket of this.sockets) {
      socket.emit('stateUpdate', gameState);
    }
    this.projectileStates = [];
  }

  private handlePlayerDisconnect(playerId: string): void {
    this.players.delete(playerId);
    this.playerScores.delete(playerId);
    this.sockets = this.sockets.filter(s => s.id !== playerId);
    if (this.sockets.length === 0) this.cleanup();
  }

  private handlePlayerShooting(
    playerId: string, 
    projectileId: string,
    x: number,
    y: number,
  ): void {
      if (this.gamePhase !== 'active') return;
      const p = this.players.get(playerId);
      if (!p) return;
      
      const projectile = new Projectile(p.x, p.y, x, y, 30, 5000, 0.05, projectileId, p.id);
      logger.info(`Player ${playerId} shot event triggered with projectile id: ${projectileId}`);
      const otherPlayer = Array.from(this.players.values()).filter(player => player.id !== playerId);
      logger.info(`Projectile spawn location: ${projectile.getX()}, ${projectile.getY()}`);
      logger.info(`Projectile target location: ${x}, ${y}`);
      logger.info(`Location of shooter when shot was triggered: ${p.x}, ${p.y}`);
      logger.info(`Location of other player when shot was triggered: ${otherPlayer[0].x}, ${otherPlayer[0].y}`);
      this.projectiles.push(projectile);
  }

  private handlePlayerInput(playerId: string, x: number, y: number): void {
    if (this.gamePhase !== 'active') return;
    const p = this.players.get(playerId);
    if (p) {
      p.x = x;
      p.y = y;
    }
  }

  private handleCollision(projectile: Projectile, player: PlayerState) {
      this.totalCollisions++;
      logger.info(`Collision: ${projectile.getId()} hit ${player.id}`);
      player.hp -= 10;

      if (player.hp <= 0) {
        this.handlePlayerDeath(player.id, projectile.getOwnerId());
      }
      
  }

  private handlePlayerDeath(victimId: string, killerId: string) {
      this.players.delete(victimId);
      // Update death count for killed player
      const killedPlayerScore = this.playerScores.get(victimId);
      if (killedPlayerScore) {
        killedPlayerScore.deaths++;
      }
      // Update kill count for shooter
      const shooterScore = this.playerScores.get(killerId);
      if (shooterScore) {
        shooterScore.kills++;
        this.checkWinCondition();
      }

      this.scheulePlayerRespawn(victimId);
  }

  private scheulePlayerRespawn(playerId: string) {
      const id = setTimeout(() => {
        if (this.gamePhase !== 'active') return;
        this.players.set(playerId, {
          id: playerId,
          x: this.startingX,
          y: this.startingY,
          hp: 100,
        });
        this.timeoutIds.delete(id);
      }, 3000);
      this.timeoutIds.add(id);
  }

  private handleError(error: Error, context: string): void {
    logger.error(`Error in Match ${this.id} - ${context}: ${error.message}`);
    // Could add additional error handling logic here
  }

  
  private cleanup() {
    this.gamePhase = 'ended';
    if (this.interval) clearInterval(this.interval);
    for (const id of this.timeoutIds) {
      clearTimeout(id);
    }
    for (const socket of this.sockets) {
      socket.removeAllListeners('playerInput');
      socket.removeAllListeners('shoot');
      // We dont want to disconnect the socket here, just remove listeners for this match.
    }
        // Clear all game state
    this.players.clear();
    this.projectiles = [];
    this.projectileStates = [];
    this.timeoutIds.clear();
    this.playerScores.clear();
    
    // Ensure game loop variables are reset
    this.interval = null;
    this.totalCollisions = 0;
    this.readyPlayers.clear();


    logger.info(`Match ${this.id} ended and cleaned up \n\n`);
  }




}
