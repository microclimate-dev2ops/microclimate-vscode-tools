import { uppercaseFirstChar } from "../../MCUtil";
import { IconPaths, Icon, getIconPaths } from "../../constants/Icons";

export class ProjectType {

    public readonly type: ProjectType.Types;
    public readonly userFriendlyType: string;
    public readonly debugType: string | undefined;

    public readonly icon: IconPaths;

    constructor(
        public readonly projectType: string,
        public readonly language: string,
    ) {
        this.type = ProjectType.getType(projectType);
        this.userFriendlyType = ProjectType.getUserFriendlyType(this.type, language);
        this.debugType = ProjectType.getDebugType(this.type);
        this.icon = ProjectType.getProjectIcon(this.type, language);
    }

    public toString(): string {
        return this.userFriendlyType;
    }

    /**
     *
     * @param projectType A Microclimate internal project type.
     */
    private static getType(projectType: string): ProjectType.Types {
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

    /**
     * Get the corresponding VSCode debug configuration "type" value.
     * Returns undefined if we don't know how to debug this project type.
     */
    private static getDebugType(type: ProjectType.Types): string | undefined {
        switch(type) {
            case ProjectType.Types.MICROPROFILE:
            case ProjectType.Types.SPRING:
                return "java";
            default:
                return undefined;
        }
    }

    private static getProjectIcon(type: ProjectType.Types, language: string): IconPaths {
        // Right now these are stolen from https://github.com/Microsoft/vscode/tree/master/resources
        switch (type) {
            case ProjectType.Types.MICROPROFILE:
                return getIconPaths(Icon.Microprofile);
            case ProjectType.Types.SPRING:
                return getIconPaths(Icon.Spring);
            case ProjectType.Types.NODE:
                return getIconPaths(Icon.Node);
            case ProjectType.Types.SWIFT:
                return getIconPaths(Icon.Swift);
            case ProjectType.Types.DOCKER:
                if (language === "python") {
                    return getIconPaths(Icon.Python);
                }
                else if (language === "go") {
                    return getIconPaths(Icon.Go);
                }
                else {
                    // This is our fall-back, we could possibly use a more generic icon.
                    return getIconPaths(Icon.Docker);
                }
            default:
                return getIconPaths(Icon.Generic);
        }
    }

    private static getUserFriendlyType(type: ProjectType.Types, language: string): string {
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
        // String value must be user-friendly!
        MICROPROFILE = "Microprofile",
        SPRING = "Spring",
        NODE = "Node.js",
        SWIFT = "Swift",
        DOCKER = "Docker",
        UNKNOWN = "Unknown"
    }
}
