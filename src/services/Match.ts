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
import { match } from 'assert';



type Region = 'NA' | 'EU' | 'ASIA' | 'GLOBAL';


export type PlayerState = {
  id: string;
  x: number;
  y: number;
  hp: number;
  isBystander: boolean;
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
  private sockets: Socket[] = [];
  private region: Region;
  private respawnQueue: Set<string> = new Set();
  private matchIsActive = true;
  

  constructor(
    sockets: Socket[],
    region: Region,
    id = `match-${Math.random().toString(36).substring(2, 8)}`,
    public matches: Map<string, Match> = new Map(),
  ) {
    this.id = id;
    this.sockets = sockets;
    this.region = region;

    this.initalizePlayerData(sockets);
    this.setUpPlayerSocketHandlers(sockets);
    // Start game loop loop (this will broadcast the game state to all players)
    this.interval = setInterval(() => this.update(), 1000 / 60); 
  }

  public addPlayer(socket: Socket): void {
    this.sockets.push(socket);
    
    // Initialize new player as bystander
    this.players.set(socket.id, {
      id: socket.id,
      x: this.startingX,
      y: this.startingY,
      hp: 100,
      isBystander: true
    });

    this.playerScores.set(socket.id, {
      kills: 0,
      deaths: 0
    });

    this.setUpPlayerSocketHandlers([socket]);
    
    // Inform new player of current game state
    socket.emit('stateUpdate', {
      players: Array.from(this.players.values()),
      projectiles: this.projectileStates,
      scores: Array.from(this.playerScores.entries())
        .map(([playerId, score]) => ({
          playerId,
          ...score
        }))
    });
  }

  public getId(): string {
    return this.id;
  } 

  public getRegion(): Region {
    return this.region;
  }

  private handleToggleBystander(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.isBystander = false;
    logger.info(`Player ${playerId} is no longer a bystander`);
  }

  private initalizePlayerData(sockets: Socket[]) {
    for (const socket of sockets) {
      // Setup player state
      this.players.set(socket.id, {
        id: socket.id,
        x: this.startingX,
        y: this.startingY,
        hp: 100,
        isBystander: true
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
      socket.on('playerInput', ({ x, y }) => this.handlePlayerInput(socket.id, x, y));
      socket.on('shoot', ({ x, y, id }) => this.handlePlayerShooting(socket.id, id, x, y));
      socket.on('toggleBystander', () => this.handleToggleBystander(socket.id));
      socket.on('disconnect', () => this.handlePlayerDisconnect(socket.id));
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

      this.matchIsActive = false;
      
      // Clear any pending respawn timeouts
      for (const id of this.timeoutIds) {
        clearTimeout(id);
      }

      // Respawn any players in the respawn queue

      console.log(`Number of dead players: ${this.respawnQueue.size}`);
      console.log(`numbner of players alive: ${this.players.size}`);

      for (const playerId of this.respawnQueue) {
          this.players.set(playerId, {
            id: playerId,
            x: this.startingX,
            y: this.startingY,
            hp: 100,
            isBystander: false
          });
      }
      console.log(`after respoawn, Number of dead players: ${this.respawnQueue.size}`);
      console.log(`after respawn, number of players alive: ${this.players.size}`);
    

      for (const socket of this.sockets) {
        socket.emit('gameOver', sortedScores);
      }



      this.respawnQueue.clear();
      this.timeoutIds.clear();

      // Reset match.
      setTimeout(() => this.resetMatch(), 5000); // Wait 5 seconds before resetting

    }
  }

  private update() {
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
      if (this.matchIsActive === true) {
        for (const player of this.players.values()) {
          if (projectile.getOwnerId() === player.id || player.isBystander) continue;
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
            logger.info(`Collision detected between projectile ${projectile.getId()} and player ${player.id}`);
            projectilesToRemove.push(i);
            this.handleCollision(projectile, player);
            break;
          }
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
    if (this.sockets.length === 0) this.cleanUpSession();
  }

  private handlePlayerShooting(
    playerId: string, 
    projectileId: string,
    x: number,
    y: number,
  ): void {
      const p = this.players.get(playerId);
      if (!p || p.isBystander) return;
      
      const projectile = new Projectile(p.x, p.y, x, y, 30, 5000, 0.05, projectileId, p.id);
      this.projectiles.push(projectile);
  }

  private handlePlayerInput(playerId: string, x: number, y: number): void {
    const p = this.players.get(playerId);
    if (p) {
      p.x = x;
      p.y = y;
    }
  }

  private handleCollision(projectile: Projectile, player: PlayerState) {
      if (player.isBystander) return; // Prevent damage to bystanders
      this.totalCollisions++;
      logger.info(`Collision: ${projectile.getId()} hit ${player.id}`);
      player.hp -= 10;

      if (player.hp <= 0) {
        this.handlePlayerDeath(player.id, projectile.getOwnerId());
      }
      
  }

  private handlePlayerDeath(victimId: string, killerId: string) {
      this.players.delete(victimId);
      this.scheulePlayerRespawn(victimId);

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

  }



  private scheulePlayerRespawn(playerId: string) {
      this.respawnQueue.add(playerId);
      console.log(`Player ${playerId} is scheduled for respawn`);
      const id = setTimeout(() => {
        console.log(`Inside schedulePlayerRespawn timeout for player ${playerId}`);
        const needsRespawn = this.respawnQueue.has(playerId);
        console.log(`Player ${playerId} needs respawn: ${needsRespawn}`);
        if (needsRespawn === false) return; // Player is not in respawn queue
        this.respawnQueue.delete(playerId);
        this.players.set(playerId, {
          id: playerId,
          x: this.startingX,
          y: this.startingY,
          hp: 100,
          isBystander: false
        });
        this.timeoutIds.delete(id);
      }, 3000);

      this.timeoutIds.add(id);
  }

  private resetMatch(): void {

    // Clear all active projectiles
    this.projectiles = [];
    this.projectileStates = [];
    
    // Reset round-specific state
    this.totalCollisions = 0;

    // Reset player health and scores but maintain positions and bystander status
    for (const [playerId, player] of this.players.entries()) {
      player.hp = 100;
      // Keep x, y positions and isBystander state
      
      // Reset scores for new round
      this.playerScores.set(playerId, {
        kills: 0,
        deaths: 0
      });
    }
    // Inform players of match reset
    for (const socket of this.sockets) {
      socket.emit('matchReset', {
        players: Array.from(this.players.values()),
        scores: Array.from(this.playerScores.entries())
          .map(([playerId, score]) => ({
            playerId,
            ...score
          }))
      });
    }

    this.matchIsActive = true;

  }

  private handleError(error: Error, context: string): void {
    logger.error(`Error in Match ${this.id} - ${context}: ${error.message}`);
    // Could add additional error handling logic here
  }



  
  private cleanUpSession() {
    this.matches.delete(this.id);
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


    logger.info(`Match ${this.id} ended and cleaned up \n\n`);
  }




}
