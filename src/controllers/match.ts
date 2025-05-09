import { Request, Response } from 'express';

export const getMatch = (req: Request, res: Response) => {
    const id = `match-${Math.random().toString(36).substring(2, 8)}`; // TOOD: Replace with UUID?
    const match = { id, players: [] };
    res.send()
}