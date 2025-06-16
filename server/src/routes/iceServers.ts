import { Router, Request, Response } from 'express';
import twilio from 'twilio';

export default function iceServerRoutes(): Router {
    const router = Router();

    router.get('/', (async (_: Request, res: Response) => {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;

        if (!accountSid || !authToken) {
            console.error('Twilio credentials are not configured.');
            return res.status(500).json({ message: 'Server configuration error for ICE servers.' });
        }

        const client = twilio(accountSid, authToken);

        try {
            const token = await client.tokens.create({ ttl: 3600 * 4 }); // TTL of 4 hours
            return res.status(200).json(token.iceServers);

        } catch (error) {
            console.error('Error fetching Twilio ICE servers:', error);
            return res.status(500).json({ message: 'Failed to fetch ICE servers from Twilio.' });
        }
    }) as unknown as Router);

    return router;
}