"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const winston_1 = __importDefault(require("winston"));
const routes_1 = __importDefault(require("./routes/routes")); // Adjust the extension based on your TypeScript setup
// Initialize Express app
const app = (0, express_1.default)();
// Middleware
app.use((0, helmet_1.default)());
app.use(express_1.default.json());
// Logger setup with Winston
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.json(),
    transports: [
        new winston_1.default.transports.Console(),
        new winston_1.default.transports.File({ filename: 'server.log' }),
    ],
});
// Routes
app.use('/api', routes_1.default);
// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});
