export const calculateLateTime = (scheduled: string, actual?: string): number => {
    return actual ? Math.max(0, (new Date(actual).getTime() - new Date(scheduled).getTime()) / 1000) : 0;
};