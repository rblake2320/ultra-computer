import { GraphQLScalarType, Kind } from "graphql";

/**
 * JSON scalar — accepts any serializable JSON value as input/output.
 */
export const GraphQLJSON = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value (object, array, string, number, boolean, or null).",
  serialize(value: unknown): unknown {
    return value;
  },
  parseValue(value: unknown): unknown {
    return value;
  },
  parseLiteral(ast, variables): unknown {
    switch (ast.kind) {
      case Kind.STRING:
        return ast.value;
      case Kind.BOOLEAN:
        return ast.value;
      case Kind.INT:
        return parseInt(ast.value, 10);
      case Kind.FLOAT:
        return parseFloat(ast.value);
      case Kind.OBJECT: {
        const obj: Record<string, unknown> = {};
        for (const field of ast.fields) {
          obj[field.name.value] = GraphQLJSON.parseLiteral(field.value, variables);
        }
        return obj;
      }
      case Kind.LIST:
        return ast.values.map((v) => GraphQLJSON.parseLiteral(v, variables));
      case Kind.NULL:
        return null;
      default:
        return undefined;
    }
  },
});
