
export class ProjectTypes {

    public static getUserFriendlyType(projectType: string, language: string) {
        if (projectType === "liberty") {
            return "Microprofile";
        }
        else if (projectType === "spring") {
            return "Spring";
        }
        else if (projectType === "nodejs") {
            return "Node.js";
        }
        else if (projectType === "swift") {
            return "Swift";
        }
        else if (projectType === "docker" && language != null) {
            return this.uppercaseFirstChar(language);
        }
        else {
            console.error(`Unrecognized project - type ${projectType}, language ${language}`);
            return "Unknown";
        }
    }

    private static uppercaseFirstChar(input: string): string {
        return input.charAt(0).toUpperCase() + input.slice(1);
    }
}
