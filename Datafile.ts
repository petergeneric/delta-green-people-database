export interface Datafile {
    gameStage: number
    stages?: {
        [gameStagePoint: string]: string
    }
    records: {
        id?: string
        surname?: string
        forename?: string
        type?: string
        status?: string
        classifier?: string

        dateOfBirth?: string
        dateOfDeath?: string

        lastKnownAddress?: string

        warning?: string
        notes?: string

        related?: string[]
        events?: {
            id: string
            user: string
            event: string
        }[]
    }[]
}
