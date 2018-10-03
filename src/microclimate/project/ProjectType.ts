import { uppercaseFirstChar, IconPaths, getIconObj } from "../../MCUtil";

export class ProjectType {

    public readonly type: ProjectType.Types;
    public readonly userFriendlyType: string;
    public readonly icon: IconPaths;

    constructor(
        public readonly projectType: string,
        public readonly language: string,
    ) {
        this.type = ProjectType.getType(projectType);
        this.userFriendlyType = ProjectType.getUserFriendlyType(this.type, language);
        this.icon = ProjectType.getIcons(language);
    }

    public toString(): string {
        return this.userFriendlyType;
    }

    private static getType(projectType: string) {
        if (projectType === "liberty") {
            return ProjectType.Types.MICROPROFILE;
        }
        else if (projectType === "spring") {
            return ProjectType.Types.SPRING;
        }
        else if (projectType === "nodejs") {
            return ProjectType.Types.NODE;
        }
        else if (projectType === "swift") {
            return ProjectType.Types.SWIFT;
        }
        else if (projectType === "docker") {
            return ProjectType.Types.DOCKER;
        }
        else {
            console.error(`Unrecognized project - type ${projectType}`);
            return ProjectType.Types.UNKNOWN;
        }
    }

    private static getIcons(language: string): IconPaths {
        // Right now these are stolen from https://github.com/Microsoft/vscode/tree/master/resources
        return getIconObj(language + ".png", false);
    }

    private static getUserFriendlyType(type: ProjectType.Types, language: string) {
        // For docker projects, return the language, eg "Python"
        if (type === ProjectType.Types.DOCKER && language != null) {
            return uppercaseFirstChar(language);
        }
        // For all other types, the enum's string value is user-friendly
        return type.toString();
    }
}

export namespace ProjectType {

    export enum Types {
        MICROPROFILE = "Microprofile",
        SPRING = "Spring",
        NODE = "Node.js",
        SWIFT = "Swift",
        DOCKER = "Docker",
        UNKNOWN = "Unknown"
    }
}
