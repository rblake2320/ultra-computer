/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import * as $protobuf from "protobufjs/minimal";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const ultra = $root.ultra = (() => {

    /**
     * Namespace ultra.
     * @exports ultra
     * @namespace
     */
    const ultra = {};

    ultra.common = (function() {

        /**
         * Namespace common.
         * @memberof ultra
         * @namespace
         */
        const common = {};

        common.Empty = (function() {

            /**
             * Properties of an Empty.
             * @memberof ultra.common
             * @interface IEmpty
             */

            /**
             * Constructs a new Empty.
             * @memberof ultra.common
             * @classdesc Represents an Empty.
             * @implements IEmpty
             * @constructor
             * @param {ultra.common.IEmpty=} [properties] Properties to set
             */
            function Empty(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * Creates a new Empty instance using the specified properties.
             * @function create
             * @memberof ultra.common.Empty
             * @static
             * @param {ultra.common.IEmpty=} [properties] Properties to set
             * @returns {ultra.common.Empty} Empty instance
             */
            Empty.create = function create(properties) {
                return new Empty(properties);
            };

            /**
             * Encodes the specified Empty message. Does not implicitly {@link ultra.common.Empty.verify|verify} messages.
             * @function encode
             * @memberof ultra.common.Empty
             * @static
             * @param {ultra.common.IEmpty} message Empty message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Empty.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                return writer;
            };

            /**
             * Encodes the specified Empty message, length delimited. Does not implicitly {@link ultra.common.Empty.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.common.Empty
             * @static
             * @param {ultra.common.IEmpty} message Empty message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Empty.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an Empty message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.common.Empty
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.common.Empty} Empty
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Empty.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.common.Empty();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes an Empty message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.common.Empty
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.common.Empty} Empty
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Empty.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an Empty message.
             * @function verify
             * @memberof ultra.common.Empty
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            Empty.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                return null;
            };

            /**
             * Creates an Empty message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.common.Empty
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.common.Empty} Empty
             */
            Empty.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.common.Empty)
                    return object;
                return new $root.ultra.common.Empty();
            };

            /**
             * Creates a plain object from an Empty message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.common.Empty
             * @static
             * @param {ultra.common.Empty} message Empty
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Empty.toObject = function toObject() {
                return {};
            };

            /**
             * Converts this Empty to JSON.
             * @function toJSON
             * @memberof ultra.common.Empty
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Empty.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for Empty
             * @function getTypeUrl
             * @memberof ultra.common.Empty
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            Empty.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.common.Empty";
            };

            return Empty;
        })();

        common.IdRequest = (function() {

            /**
             * Properties of an IdRequest.
             * @memberof ultra.common
             * @interface IIdRequest
             * @property {string|null} [id] IdRequest id
             */

            /**
             * Constructs a new IdRequest.
             * @memberof ultra.common
             * @classdesc Represents an IdRequest.
             * @implements IIdRequest
             * @constructor
             * @param {ultra.common.IIdRequest=} [properties] Properties to set
             */
            function IdRequest(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * IdRequest id.
             * @member {string} id
             * @memberof ultra.common.IdRequest
             * @instance
             */
            IdRequest.prototype.id = "";

            /**
             * Creates a new IdRequest instance using the specified properties.
             * @function create
             * @memberof ultra.common.IdRequest
             * @static
             * @param {ultra.common.IIdRequest=} [properties] Properties to set
             * @returns {ultra.common.IdRequest} IdRequest instance
             */
            IdRequest.create = function create(properties) {
                return new IdRequest(properties);
            };

            /**
             * Encodes the specified IdRequest message. Does not implicitly {@link ultra.common.IdRequest.verify|verify} messages.
             * @function encode
             * @memberof ultra.common.IdRequest
             * @static
             * @param {ultra.common.IIdRequest} message IdRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            IdRequest.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
                return writer;
            };

            /**
             * Encodes the specified IdRequest message, length delimited. Does not implicitly {@link ultra.common.IdRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.common.IdRequest
             * @static
             * @param {ultra.common.IIdRequest} message IdRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            IdRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an IdRequest message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.common.IdRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.common.IdRequest} IdRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            IdRequest.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.common.IdRequest();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.id = reader.string();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes an IdRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.common.IdRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.common.IdRequest} IdRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            IdRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an IdRequest message.
             * @function verify
             * @memberof ultra.common.IdRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            IdRequest.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.id != null && message.hasOwnProperty("id"))
                    if (!$util.isString(message.id))
                        return "id: string expected";
                return null;
            };

            /**
             * Creates an IdRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.common.IdRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.common.IdRequest} IdRequest
             */
            IdRequest.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.common.IdRequest)
                    return object;
                let message = new $root.ultra.common.IdRequest();
                if (object.id != null)
                    message.id = String(object.id);
                return message;
            };

            /**
             * Creates a plain object from an IdRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.common.IdRequest
             * @static
             * @param {ultra.common.IdRequest} message IdRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            IdRequest.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.defaults)
                    object.id = "";
                if (message.id != null && message.hasOwnProperty("id"))
                    object.id = message.id;
                return object;
            };

            /**
             * Converts this IdRequest to JSON.
             * @function toJSON
             * @memberof ultra.common.IdRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            IdRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for IdRequest
             * @function getTypeUrl
             * @memberof ultra.common.IdRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            IdRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.common.IdRequest";
            };

            return IdRequest;
        })();

        common.DeleteResponse = (function() {

            /**
             * Properties of a DeleteResponse.
             * @memberof ultra.common
             * @interface IDeleteResponse
             * @property {boolean|null} [success] DeleteResponse success
             */

            /**
             * Constructs a new DeleteResponse.
             * @memberof ultra.common
             * @classdesc Represents a DeleteResponse.
             * @implements IDeleteResponse
             * @constructor
             * @param {ultra.common.IDeleteResponse=} [properties] Properties to set
             */
            function DeleteResponse(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * DeleteResponse success.
             * @member {boolean} success
             * @memberof ultra.common.DeleteResponse
             * @instance
             */
            DeleteResponse.prototype.success = false;

            /**
             * Creates a new DeleteResponse instance using the specified properties.
             * @function create
             * @memberof ultra.common.DeleteResponse
             * @static
             * @param {ultra.common.IDeleteResponse=} [properties] Properties to set
             * @returns {ultra.common.DeleteResponse} DeleteResponse instance
             */
            DeleteResponse.create = function create(properties) {
                return new DeleteResponse(properties);
            };

            /**
             * Encodes the specified DeleteResponse message. Does not implicitly {@link ultra.common.DeleteResponse.verify|verify} messages.
             * @function encode
             * @memberof ultra.common.DeleteResponse
             * @static
             * @param {ultra.common.IDeleteResponse} message DeleteResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            DeleteResponse.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.success != null && Object.hasOwnProperty.call(message, "success"))
                    writer.uint32(/* id 1, wireType 0 =*/8).bool(message.success);
                return writer;
            };

            /**
             * Encodes the specified DeleteResponse message, length delimited. Does not implicitly {@link ultra.common.DeleteResponse.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.common.DeleteResponse
             * @static
             * @param {ultra.common.IDeleteResponse} message DeleteResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            DeleteResponse.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a DeleteResponse message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.common.DeleteResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.common.DeleteResponse} DeleteResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            DeleteResponse.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.common.DeleteResponse();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.success = reader.bool();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a DeleteResponse message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.common.DeleteResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.common.DeleteResponse} DeleteResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            DeleteResponse.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a DeleteResponse message.
             * @function verify
             * @memberof ultra.common.DeleteResponse
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            DeleteResponse.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.success != null && message.hasOwnProperty("success"))
                    if (typeof message.success !== "boolean")
                        return "success: boolean expected";
                return null;
            };

            /**
             * Creates a DeleteResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.common.DeleteResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.common.DeleteResponse} DeleteResponse
             */
            DeleteResponse.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.common.DeleteResponse)
                    return object;
                let message = new $root.ultra.common.DeleteResponse();
                if (object.success != null)
                    message.success = Boolean(object.success);
                return message;
            };

            /**
             * Creates a plain object from a DeleteResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.common.DeleteResponse
             * @static
             * @param {ultra.common.DeleteResponse} message DeleteResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            DeleteResponse.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.defaults)
                    object.success = false;
                if (message.success != null && message.hasOwnProperty("success"))
                    object.success = message.success;
                return object;
            };

            /**
             * Converts this DeleteResponse to JSON.
             * @function toJSON
             * @memberof ultra.common.DeleteResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            DeleteResponse.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for DeleteResponse
             * @function getTypeUrl
             * @memberof ultra.common.DeleteResponse
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            DeleteResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.common.DeleteResponse";
            };

            return DeleteResponse;
        })();

        return common;
    })();

    ultra.conversations = (function() {

        /**
         * Namespace conversations.
         * @memberof ultra
         * @namespace
         */
        const conversations = {};

        conversations.Conversation = (function() {

            /**
             * Properties of a Conversation.
             * @memberof ultra.conversations
             * @interface IConversation
             * @property {string|null} [id] Conversation id
             * @property {string|null} [title] Conversation title
             * @property {string|null} [status] Conversation status
             * @property {string|null} [orchestratorModelId] Conversation orchestratorModelId
             * @property {string|null} [activeSkillIds] Conversation activeSkillIds
             * @property {number|Long|null} [createdAt] Conversation createdAt
             * @property {number|Long|null} [updatedAt] Conversation updatedAt
             */

            /**
             * Constructs a new Conversation.
             * @memberof ultra.conversations
             * @classdesc Represents a Conversation.
             * @implements IConversation
             * @constructor
             * @param {ultra.conversations.IConversation=} [properties] Properties to set
             */
            function Conversation(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * Conversation id.
             * @member {string} id
             * @memberof ultra.conversations.Conversation
             * @instance
             */
            Conversation.prototype.id = "";

            /**
             * Conversation title.
             * @member {string} title
             * @memberof ultra.conversations.Conversation
             * @instance
             */
            Conversation.prototype.title = "";

            /**
             * Conversation status.
             * @member {string} status
             * @memberof ultra.conversations.Conversation
             * @instance
             */
            Conversation.prototype.status = "";

            /**
             * Conversation orchestratorModelId.
             * @member {string} orchestratorModelId
             * @memberof ultra.conversations.Conversation
             * @instance
             */
            Conversation.prototype.orchestratorModelId = "";

            /**
             * Conversation activeSkillIds.
             * @member {string} activeSkillIds
             * @memberof ultra.conversations.Conversation
             * @instance
             */
            Conversation.prototype.activeSkillIds = "";

            /**
             * Conversation createdAt.
             * @member {number|Long} createdAt
             * @memberof ultra.conversations.Conversation
             * @instance
             */
            Conversation.prototype.createdAt = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * Conversation updatedAt.
             * @member {number|Long} updatedAt
             * @memberof ultra.conversations.Conversation
             * @instance
             */
            Conversation.prototype.updatedAt = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * Creates a new Conversation instance using the specified properties.
             * @function create
             * @memberof ultra.conversations.Conversation
             * @static
             * @param {ultra.conversations.IConversation=} [properties] Properties to set
             * @returns {ultra.conversations.Conversation} Conversation instance
             */
            Conversation.create = function create(properties) {
                return new Conversation(properties);
            };

            /**
             * Encodes the specified Conversation message. Does not implicitly {@link ultra.conversations.Conversation.verify|verify} messages.
             * @function encode
             * @memberof ultra.conversations.Conversation
             * @static
             * @param {ultra.conversations.IConversation} message Conversation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Conversation.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
                if (message.title != null && Object.hasOwnProperty.call(message, "title"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.title);
                if (message.status != null && Object.hasOwnProperty.call(message, "status"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.status);
                if (message.orchestratorModelId != null && Object.hasOwnProperty.call(message, "orchestratorModelId"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.orchestratorModelId);
                if (message.activeSkillIds != null && Object.hasOwnProperty.call(message, "activeSkillIds"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.activeSkillIds);
                if (message.createdAt != null && Object.hasOwnProperty.call(message, "createdAt"))
                    writer.uint32(/* id 6, wireType 0 =*/48).int64(message.createdAt);
                if (message.updatedAt != null && Object.hasOwnProperty.call(message, "updatedAt"))
                    writer.uint32(/* id 7, wireType 0 =*/56).int64(message.updatedAt);
                return writer;
            };

            /**
             * Encodes the specified Conversation message, length delimited. Does not implicitly {@link ultra.conversations.Conversation.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.conversations.Conversation
             * @static
             * @param {ultra.conversations.IConversation} message Conversation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Conversation.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a Conversation message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.conversations.Conversation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.conversations.Conversation} Conversation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Conversation.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.conversations.Conversation();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.id = reader.string();
                            break;
                        }
                    case 2: {
                            message.title = reader.string();
                            break;
                        }
                    case 3: {
                            message.status = reader.string();
                            break;
                        }
                    case 4: {
                            message.orchestratorModelId = reader.string();
                            break;
                        }
                    case 5: {
                            message.activeSkillIds = reader.string();
                            break;
                        }
                    case 6: {
                            message.createdAt = reader.int64();
                            break;
                        }
                    case 7: {
                            message.updatedAt = reader.int64();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a Conversation message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.conversations.Conversation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.conversations.Conversation} Conversation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Conversation.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a Conversation message.
             * @function verify
             * @memberof ultra.conversations.Conversation
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            Conversation.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.id != null && message.hasOwnProperty("id"))
                    if (!$util.isString(message.id))
                        return "id: string expected";
                if (message.title != null && message.hasOwnProperty("title"))
                    if (!$util.isString(message.title))
                        return "title: string expected";
                if (message.status != null && message.hasOwnProperty("status"))
                    if (!$util.isString(message.status))
                        return "status: string expected";
                if (message.orchestratorModelId != null && message.hasOwnProperty("orchestratorModelId"))
                    if (!$util.isString(message.orchestratorModelId))
                        return "orchestratorModelId: string expected";
                if (message.activeSkillIds != null && message.hasOwnProperty("activeSkillIds"))
                    if (!$util.isString(message.activeSkillIds))
                        return "activeSkillIds: string expected";
                if (message.createdAt != null && message.hasOwnProperty("createdAt"))
                    if (!$util.isInteger(message.createdAt) && !(message.createdAt && $util.isInteger(message.createdAt.low) && $util.isInteger(message.createdAt.high)))
                        return "createdAt: integer|Long expected";
                if (message.updatedAt != null && message.hasOwnProperty("updatedAt"))
                    if (!$util.isInteger(message.updatedAt) && !(message.updatedAt && $util.isInteger(message.updatedAt.low) && $util.isInteger(message.updatedAt.high)))
                        return "updatedAt: integer|Long expected";
                return null;
            };

            /**
             * Creates a Conversation message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.conversations.Conversation
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.conversations.Conversation} Conversation
             */
            Conversation.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.conversations.Conversation)
                    return object;
                let message = new $root.ultra.conversations.Conversation();
                if (object.id != null)
                    message.id = String(object.id);
                if (object.title != null)
                    message.title = String(object.title);
                if (object.status != null)
                    message.status = String(object.status);
                if (object.orchestratorModelId != null)
                    message.orchestratorModelId = String(object.orchestratorModelId);
                if (object.activeSkillIds != null)
                    message.activeSkillIds = String(object.activeSkillIds);
                if (object.createdAt != null)
                    if ($util.Long)
                        (message.createdAt = $util.Long.fromValue(object.createdAt)).unsigned = false;
                    else if (typeof object.createdAt === "string")
                        message.createdAt = parseInt(object.createdAt, 10);
                    else if (typeof object.createdAt === "number")
                        message.createdAt = object.createdAt;
                    else if (typeof object.createdAt === "object")
                        message.createdAt = new $util.LongBits(object.createdAt.low >>> 0, object.createdAt.high >>> 0).toNumber();
                if (object.updatedAt != null)
                    if ($util.Long)
                        (message.updatedAt = $util.Long.fromValue(object.updatedAt)).unsigned = false;
                    else if (typeof object.updatedAt === "string")
                        message.updatedAt = parseInt(object.updatedAt, 10);
                    else if (typeof object.updatedAt === "number")
                        message.updatedAt = object.updatedAt;
                    else if (typeof object.updatedAt === "object")
                        message.updatedAt = new $util.LongBits(object.updatedAt.low >>> 0, object.updatedAt.high >>> 0).toNumber();
                return message;
            };

            /**
             * Creates a plain object from a Conversation message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.conversations.Conversation
             * @static
             * @param {ultra.conversations.Conversation} message Conversation
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Conversation.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.defaults) {
                    object.id = "";
                    object.title = "";
                    object.status = "";
                    object.orchestratorModelId = "";
                    object.activeSkillIds = "";
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.createdAt = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.createdAt = options.longs === String ? "0" : 0;
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.updatedAt = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.updatedAt = options.longs === String ? "0" : 0;
                }
                if (message.id != null && message.hasOwnProperty("id"))
                    object.id = message.id;
                if (message.title != null && message.hasOwnProperty("title"))
                    object.title = message.title;
                if (message.status != null && message.hasOwnProperty("status"))
                    object.status = message.status;
                if (message.orchestratorModelId != null && message.hasOwnProperty("orchestratorModelId"))
                    object.orchestratorModelId = message.orchestratorModelId;
                if (message.activeSkillIds != null && message.hasOwnProperty("activeSkillIds"))
                    object.activeSkillIds = message.activeSkillIds;
                if (message.createdAt != null && message.hasOwnProperty("createdAt"))
                    if (typeof message.createdAt === "number")
                        object.createdAt = options.longs === String ? String(message.createdAt) : message.createdAt;
                    else
                        object.createdAt = options.longs === String ? $util.Long.prototype.toString.call(message.createdAt) : options.longs === Number ? new $util.LongBits(message.createdAt.low >>> 0, message.createdAt.high >>> 0).toNumber() : message.createdAt;
                if (message.updatedAt != null && message.hasOwnProperty("updatedAt"))
                    if (typeof message.updatedAt === "number")
                        object.updatedAt = options.longs === String ? String(message.updatedAt) : message.updatedAt;
                    else
                        object.updatedAt = options.longs === String ? $util.Long.prototype.toString.call(message.updatedAt) : options.longs === Number ? new $util.LongBits(message.updatedAt.low >>> 0, message.updatedAt.high >>> 0).toNumber() : message.updatedAt;
                return object;
            };

            /**
             * Converts this Conversation to JSON.
             * @function toJSON
             * @memberof ultra.conversations.Conversation
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Conversation.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for Conversation
             * @function getTypeUrl
             * @memberof ultra.conversations.Conversation
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            Conversation.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.conversations.Conversation";
            };

            return Conversation;
        })();

        conversations.ConversationList = (function() {

            /**
             * Properties of a ConversationList.
             * @memberof ultra.conversations
             * @interface IConversationList
             * @property {Array.<ultra.conversations.IConversation>|null} [conversations] ConversationList conversations
             */

            /**
             * Constructs a new ConversationList.
             * @memberof ultra.conversations
             * @classdesc Represents a ConversationList.
             * @implements IConversationList
             * @constructor
             * @param {ultra.conversations.IConversationList=} [properties] Properties to set
             */
            function ConversationList(properties) {
                this.conversations = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ConversationList conversations.
             * @member {Array.<ultra.conversations.IConversation>} conversations
             * @memberof ultra.conversations.ConversationList
             * @instance
             */
            ConversationList.prototype.conversations = $util.emptyArray;

            /**
             * Creates a new ConversationList instance using the specified properties.
             * @function create
             * @memberof ultra.conversations.ConversationList
             * @static
             * @param {ultra.conversations.IConversationList=} [properties] Properties to set
             * @returns {ultra.conversations.ConversationList} ConversationList instance
             */
            ConversationList.create = function create(properties) {
                return new ConversationList(properties);
            };

            /**
             * Encodes the specified ConversationList message. Does not implicitly {@link ultra.conversations.ConversationList.verify|verify} messages.
             * @function encode
             * @memberof ultra.conversations.ConversationList
             * @static
             * @param {ultra.conversations.IConversationList} message ConversationList message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ConversationList.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.conversations != null && message.conversations.length)
                    for (let i = 0; i < message.conversations.length; ++i)
                        $root.ultra.conversations.Conversation.encode(message.conversations[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                return writer;
            };

            /**
             * Encodes the specified ConversationList message, length delimited. Does not implicitly {@link ultra.conversations.ConversationList.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.conversations.ConversationList
             * @static
             * @param {ultra.conversations.IConversationList} message ConversationList message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ConversationList.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ConversationList message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.conversations.ConversationList
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.conversations.ConversationList} ConversationList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ConversationList.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.conversations.ConversationList();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            if (!(message.conversations && message.conversations.length))
                                message.conversations = [];
                            message.conversations.push($root.ultra.conversations.Conversation.decode(reader, reader.uint32()));
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a ConversationList message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.conversations.ConversationList
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.conversations.ConversationList} ConversationList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ConversationList.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a ConversationList message.
             * @function verify
             * @memberof ultra.conversations.ConversationList
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ConversationList.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.conversations != null && message.hasOwnProperty("conversations")) {
                    if (!Array.isArray(message.conversations))
                        return "conversations: array expected";
                    for (let i = 0; i < message.conversations.length; ++i) {
                        let error = $root.ultra.conversations.Conversation.verify(message.conversations[i]);
                        if (error)
                            return "conversations." + error;
                    }
                }
                return null;
            };

            /**
             * Creates a ConversationList message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.conversations.ConversationList
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.conversations.ConversationList} ConversationList
             */
            ConversationList.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.conversations.ConversationList)
                    return object;
                let message = new $root.ultra.conversations.ConversationList();
                if (object.conversations) {
                    if (!Array.isArray(object.conversations))
                        throw TypeError(".ultra.conversations.ConversationList.conversations: array expected");
                    message.conversations = [];
                    for (let i = 0; i < object.conversations.length; ++i) {
                        if (typeof object.conversations[i] !== "object")
                            throw TypeError(".ultra.conversations.ConversationList.conversations: object expected");
                        message.conversations[i] = $root.ultra.conversations.Conversation.fromObject(object.conversations[i]);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from a ConversationList message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.conversations.ConversationList
             * @static
             * @param {ultra.conversations.ConversationList} message ConversationList
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ConversationList.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.arrays || options.defaults)
                    object.conversations = [];
                if (message.conversations && message.conversations.length) {
                    object.conversations = [];
                    for (let j = 0; j < message.conversations.length; ++j)
                        object.conversations[j] = $root.ultra.conversations.Conversation.toObject(message.conversations[j], options);
                }
                return object;
            };

            /**
             * Converts this ConversationList to JSON.
             * @function toJSON
             * @memberof ultra.conversations.ConversationList
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ConversationList.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for ConversationList
             * @function getTypeUrl
             * @memberof ultra.conversations.ConversationList
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            ConversationList.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.conversations.ConversationList";
            };

            return ConversationList;
        })();

        conversations.Message = (function() {

            /**
             * Properties of a Message.
             * @memberof ultra.conversations
             * @interface IMessage
             * @property {string|null} [id] Message id
             * @property {string|null} [conversationId] Message conversationId
             * @property {string|null} [role] Message role
             * @property {string|null} [content] Message content
             * @property {string|null} [modelId] Message modelId
             * @property {string|null} [agentId] Message agentId
             * @property {string|null} [taskId] Message taskId
             * @property {string|null} [metadata] Message metadata
             * @property {number|Long|null} [createdAt] Message createdAt
             */

            /**
             * Constructs a new Message.
             * @memberof ultra.conversations
             * @classdesc Represents a Message.
             * @implements IMessage
             * @constructor
             * @param {ultra.conversations.IMessage=} [properties] Properties to set
             */
            function Message(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * Message id.
             * @member {string} id
             * @memberof ultra.conversations.Message
             * @instance
             */
            Message.prototype.id = "";

            /**
             * Message conversationId.
             * @member {string} conversationId
             * @memberof ultra.conversations.Message
             * @instance
             */
            Message.prototype.conversationId = "";

            /**
             * Message role.
             * @member {string} role
             * @memberof ultra.conversations.Message
             * @instance
             */
            Message.prototype.role = "";

            /**
             * Message content.
             * @member {string} content
             * @memberof ultra.conversations.Message
             * @instance
             */
            Message.prototype.content = "";

            /**
             * Message modelId.
             * @member {string} modelId
             * @memberof ultra.conversations.Message
             * @instance
             */
            Message.prototype.modelId = "";

            /**
             * Message agentId.
             * @member {string} agentId
             * @memberof ultra.conversations.Message
             * @instance
             */
            Message.prototype.agentId = "";

            /**
             * Message taskId.
             * @member {string} taskId
             * @memberof ultra.conversations.Message
             * @instance
             */
            Message.prototype.taskId = "";

            /**
             * Message metadata.
             * @member {string} metadata
             * @memberof ultra.conversations.Message
             * @instance
             */
            Message.prototype.metadata = "";

            /**
             * Message createdAt.
             * @member {number|Long} createdAt
             * @memberof ultra.conversations.Message
             * @instance
             */
            Message.prototype.createdAt = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * Creates a new Message instance using the specified properties.
             * @function create
             * @memberof ultra.conversations.Message
             * @static
             * @param {ultra.conversations.IMessage=} [properties] Properties to set
             * @returns {ultra.conversations.Message} Message instance
             */
            Message.create = function create(properties) {
                return new Message(properties);
            };

            /**
             * Encodes the specified Message message. Does not implicitly {@link ultra.conversations.Message.verify|verify} messages.
             * @function encode
             * @memberof ultra.conversations.Message
             * @static
             * @param {ultra.conversations.IMessage} message Message message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Message.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
                if (message.conversationId != null && Object.hasOwnProperty.call(message, "conversationId"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.conversationId);
                if (message.role != null && Object.hasOwnProperty.call(message, "role"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.role);
                if (message.content != null && Object.hasOwnProperty.call(message, "content"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.content);
                if (message.modelId != null && Object.hasOwnProperty.call(message, "modelId"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.modelId);
                if (message.agentId != null && Object.hasOwnProperty.call(message, "agentId"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.agentId);
                if (message.taskId != null && Object.hasOwnProperty.call(message, "taskId"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.taskId);
                if (message.metadata != null && Object.hasOwnProperty.call(message, "metadata"))
                    writer.uint32(/* id 8, wireType 2 =*/66).string(message.metadata);
                if (message.createdAt != null && Object.hasOwnProperty.call(message, "createdAt"))
                    writer.uint32(/* id 9, wireType 0 =*/72).int64(message.createdAt);
                return writer;
            };

            /**
             * Encodes the specified Message message, length delimited. Does not implicitly {@link ultra.conversations.Message.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.conversations.Message
             * @static
             * @param {ultra.conversations.IMessage} message Message message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Message.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a Message message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.conversations.Message
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.conversations.Message} Message
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Message.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.conversations.Message();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.id = reader.string();
                            break;
                        }
                    case 2: {
                            message.conversationId = reader.string();
                            break;
                        }
                    case 3: {
                            message.role = reader.string();
                            break;
                        }
                    case 4: {
                            message.content = reader.string();
                            break;
                        }
                    case 5: {
                            message.modelId = reader.string();
                            break;
                        }
                    case 6: {
                            message.agentId = reader.string();
                            break;
                        }
                    case 7: {
                            message.taskId = reader.string();
                            break;
                        }
                    case 8: {
                            message.metadata = reader.string();
                            break;
                        }
                    case 9: {
                            message.createdAt = reader.int64();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a Message message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.conversations.Message
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.conversations.Message} Message
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Message.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a Message message.
             * @function verify
             * @memberof ultra.conversations.Message
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            Message.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.id != null && message.hasOwnProperty("id"))
                    if (!$util.isString(message.id))
                        return "id: string expected";
                if (message.conversationId != null && message.hasOwnProperty("conversationId"))
                    if (!$util.isString(message.conversationId))
                        return "conversationId: string expected";
                if (message.role != null && message.hasOwnProperty("role"))
                    if (!$util.isString(message.role))
                        return "role: string expected";
                if (message.content != null && message.hasOwnProperty("content"))
                    if (!$util.isString(message.content))
                        return "content: string expected";
                if (message.modelId != null && message.hasOwnProperty("modelId"))
                    if (!$util.isString(message.modelId))
                        return "modelId: string expected";
                if (message.agentId != null && message.hasOwnProperty("agentId"))
                    if (!$util.isString(message.agentId))
                        return "agentId: string expected";
                if (message.taskId != null && message.hasOwnProperty("taskId"))
                    if (!$util.isString(message.taskId))
                        return "taskId: string expected";
                if (message.metadata != null && message.hasOwnProperty("metadata"))
                    if (!$util.isString(message.metadata))
                        return "metadata: string expected";
                if (message.createdAt != null && message.hasOwnProperty("createdAt"))
                    if (!$util.isInteger(message.createdAt) && !(message.createdAt && $util.isInteger(message.createdAt.low) && $util.isInteger(message.createdAt.high)))
                        return "createdAt: integer|Long expected";
                return null;
            };

            /**
             * Creates a Message message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.conversations.Message
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.conversations.Message} Message
             */
            Message.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.conversations.Message)
                    return object;
                let message = new $root.ultra.conversations.Message();
                if (object.id != null)
                    message.id = String(object.id);
                if (object.conversationId != null)
                    message.conversationId = String(object.conversationId);
                if (object.role != null)
                    message.role = String(object.role);
                if (object.content != null)
                    message.content = String(object.content);
                if (object.modelId != null)
                    message.modelId = String(object.modelId);
                if (object.agentId != null)
                    message.agentId = String(object.agentId);
                if (object.taskId != null)
                    message.taskId = String(object.taskId);
                if (object.metadata != null)
                    message.metadata = String(object.metadata);
                if (object.createdAt != null)
                    if ($util.Long)
                        (message.createdAt = $util.Long.fromValue(object.createdAt)).unsigned = false;
                    else if (typeof object.createdAt === "string")
                        message.createdAt = parseInt(object.createdAt, 10);
                    else if (typeof object.createdAt === "number")
                        message.createdAt = object.createdAt;
                    else if (typeof object.createdAt === "object")
                        message.createdAt = new $util.LongBits(object.createdAt.low >>> 0, object.createdAt.high >>> 0).toNumber();
                return message;
            };

            /**
             * Creates a plain object from a Message message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.conversations.Message
             * @static
             * @param {ultra.conversations.Message} message Message
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Message.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.defaults) {
                    object.id = "";
                    object.conversationId = "";
                    object.role = "";
                    object.content = "";
                    object.modelId = "";
                    object.agentId = "";
                    object.taskId = "";
                    object.metadata = "";
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.createdAt = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.createdAt = options.longs === String ? "0" : 0;
                }
                if (message.id != null && message.hasOwnProperty("id"))
                    object.id = message.id;
                if (message.conversationId != null && message.hasOwnProperty("conversationId"))
                    object.conversationId = message.conversationId;
                if (message.role != null && message.hasOwnProperty("role"))
                    object.role = message.role;
                if (message.content != null && message.hasOwnProperty("content"))
                    object.content = message.content;
                if (message.modelId != null && message.hasOwnProperty("modelId"))
                    object.modelId = message.modelId;
                if (message.agentId != null && message.hasOwnProperty("agentId"))
                    object.agentId = message.agentId;
                if (message.taskId != null && message.hasOwnProperty("taskId"))
                    object.taskId = message.taskId;
                if (message.metadata != null && message.hasOwnProperty("metadata"))
                    object.metadata = message.metadata;
                if (message.createdAt != null && message.hasOwnProperty("createdAt"))
                    if (typeof message.createdAt === "number")
                        object.createdAt = options.longs === String ? String(message.createdAt) : message.createdAt;
                    else
                        object.createdAt = options.longs === String ? $util.Long.prototype.toString.call(message.createdAt) : options.longs === Number ? new $util.LongBits(message.createdAt.low >>> 0, message.createdAt.high >>> 0).toNumber() : message.createdAt;
                return object;
            };

            /**
             * Converts this Message to JSON.
             * @function toJSON
             * @memberof ultra.conversations.Message
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Message.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for Message
             * @function getTypeUrl
             * @memberof ultra.conversations.Message
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            Message.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.conversations.Message";
            };

            return Message;
        })();

        conversations.MessageList = (function() {

            /**
             * Properties of a MessageList.
             * @memberof ultra.conversations
             * @interface IMessageList
             * @property {Array.<ultra.conversations.IMessage>|null} [messages] MessageList messages
             */

            /**
             * Constructs a new MessageList.
             * @memberof ultra.conversations
             * @classdesc Represents a MessageList.
             * @implements IMessageList
             * @constructor
             * @param {ultra.conversations.IMessageList=} [properties] Properties to set
             */
            function MessageList(properties) {
                this.messages = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * MessageList messages.
             * @member {Array.<ultra.conversations.IMessage>} messages
             * @memberof ultra.conversations.MessageList
             * @instance
             */
            MessageList.prototype.messages = $util.emptyArray;

            /**
             * Creates a new MessageList instance using the specified properties.
             * @function create
             * @memberof ultra.conversations.MessageList
             * @static
             * @param {ultra.conversations.IMessageList=} [properties] Properties to set
             * @returns {ultra.conversations.MessageList} MessageList instance
             */
            MessageList.create = function create(properties) {
                return new MessageList(properties);
            };

            /**
             * Encodes the specified MessageList message. Does not implicitly {@link ultra.conversations.MessageList.verify|verify} messages.
             * @function encode
             * @memberof ultra.conversations.MessageList
             * @static
             * @param {ultra.conversations.IMessageList} message MessageList message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            MessageList.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.messages != null && message.messages.length)
                    for (let i = 0; i < message.messages.length; ++i)
                        $root.ultra.conversations.Message.encode(message.messages[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                return writer;
            };

            /**
             * Encodes the specified MessageList message, length delimited. Does not implicitly {@link ultra.conversations.MessageList.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.conversations.MessageList
             * @static
             * @param {ultra.conversations.IMessageList} message MessageList message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            MessageList.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a MessageList message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.conversations.MessageList
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.conversations.MessageList} MessageList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            MessageList.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.conversations.MessageList();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            if (!(message.messages && message.messages.length))
                                message.messages = [];
                            message.messages.push($root.ultra.conversations.Message.decode(reader, reader.uint32()));
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a MessageList message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.conversations.MessageList
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.conversations.MessageList} MessageList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            MessageList.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a MessageList message.
             * @function verify
             * @memberof ultra.conversations.MessageList
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            MessageList.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.messages != null && message.hasOwnProperty("messages")) {
                    if (!Array.isArray(message.messages))
                        return "messages: array expected";
                    for (let i = 0; i < message.messages.length; ++i) {
                        let error = $root.ultra.conversations.Message.verify(message.messages[i]);
                        if (error)
                            return "messages." + error;
                    }
                }
                return null;
            };

            /**
             * Creates a MessageList message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.conversations.MessageList
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.conversations.MessageList} MessageList
             */
            MessageList.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.conversations.MessageList)
                    return object;
                let message = new $root.ultra.conversations.MessageList();
                if (object.messages) {
                    if (!Array.isArray(object.messages))
                        throw TypeError(".ultra.conversations.MessageList.messages: array expected");
                    message.messages = [];
                    for (let i = 0; i < object.messages.length; ++i) {
                        if (typeof object.messages[i] !== "object")
                            throw TypeError(".ultra.conversations.MessageList.messages: object expected");
                        message.messages[i] = $root.ultra.conversations.Message.fromObject(object.messages[i]);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from a MessageList message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.conversations.MessageList
             * @static
             * @param {ultra.conversations.MessageList} message MessageList
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            MessageList.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.arrays || options.defaults)
                    object.messages = [];
                if (message.messages && message.messages.length) {
                    object.messages = [];
                    for (let j = 0; j < message.messages.length; ++j)
                        object.messages[j] = $root.ultra.conversations.Message.toObject(message.messages[j], options);
                }
                return object;
            };

            /**
             * Converts this MessageList to JSON.
             * @function toJSON
             * @memberof ultra.conversations.MessageList
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            MessageList.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for MessageList
             * @function getTypeUrl
             * @memberof ultra.conversations.MessageList
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            MessageList.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.conversations.MessageList";
            };

            return MessageList;
        })();

        conversations.CreateConversationRequest = (function() {

            /**
             * Properties of a CreateConversationRequest.
             * @memberof ultra.conversations
             * @interface ICreateConversationRequest
             * @property {string|null} [title] CreateConversationRequest title
             * @property {string|null} [orchestratorModelId] CreateConversationRequest orchestratorModelId
             */

            /**
             * Constructs a new CreateConversationRequest.
             * @memberof ultra.conversations
             * @classdesc Represents a CreateConversationRequest.
             * @implements ICreateConversationRequest
             * @constructor
             * @param {ultra.conversations.ICreateConversationRequest=} [properties] Properties to set
             */
            function CreateConversationRequest(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * CreateConversationRequest title.
             * @member {string} title
             * @memberof ultra.conversations.CreateConversationRequest
             * @instance
             */
            CreateConversationRequest.prototype.title = "";

            /**
             * CreateConversationRequest orchestratorModelId.
             * @member {string} orchestratorModelId
             * @memberof ultra.conversations.CreateConversationRequest
             * @instance
             */
            CreateConversationRequest.prototype.orchestratorModelId = "";

            /**
             * Creates a new CreateConversationRequest instance using the specified properties.
             * @function create
             * @memberof ultra.conversations.CreateConversationRequest
             * @static
             * @param {ultra.conversations.ICreateConversationRequest=} [properties] Properties to set
             * @returns {ultra.conversations.CreateConversationRequest} CreateConversationRequest instance
             */
            CreateConversationRequest.create = function create(properties) {
                return new CreateConversationRequest(properties);
            };

            /**
             * Encodes the specified CreateConversationRequest message. Does not implicitly {@link ultra.conversations.CreateConversationRequest.verify|verify} messages.
             * @function encode
             * @memberof ultra.conversations.CreateConversationRequest
             * @static
             * @param {ultra.conversations.ICreateConversationRequest} message CreateConversationRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CreateConversationRequest.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.title != null && Object.hasOwnProperty.call(message, "title"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.title);
                if (message.orchestratorModelId != null && Object.hasOwnProperty.call(message, "orchestratorModelId"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.orchestratorModelId);
                return writer;
            };

            /**
             * Encodes the specified CreateConversationRequest message, length delimited. Does not implicitly {@link ultra.conversations.CreateConversationRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.conversations.CreateConversationRequest
             * @static
             * @param {ultra.conversations.ICreateConversationRequest} message CreateConversationRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CreateConversationRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a CreateConversationRequest message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.conversations.CreateConversationRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.conversations.CreateConversationRequest} CreateConversationRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CreateConversationRequest.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.conversations.CreateConversationRequest();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.title = reader.string();
                            break;
                        }
                    case 2: {
                            message.orchestratorModelId = reader.string();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a CreateConversationRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.conversations.CreateConversationRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.conversations.CreateConversationRequest} CreateConversationRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CreateConversationRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a CreateConversationRequest message.
             * @function verify
             * @memberof ultra.conversations.CreateConversationRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            CreateConversationRequest.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.title != null && message.hasOwnProperty("title"))
                    if (!$util.isString(message.title))
                        return "title: string expected";
                if (message.orchestratorModelId != null && message.hasOwnProperty("orchestratorModelId"))
                    if (!$util.isString(message.orchestratorModelId))
                        return "orchestratorModelId: string expected";
                return null;
            };

            /**
             * Creates a CreateConversationRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.conversations.CreateConversationRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.conversations.CreateConversationRequest} CreateConversationRequest
             */
            CreateConversationRequest.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.conversations.CreateConversationRequest)
                    return object;
                let message = new $root.ultra.conversations.CreateConversationRequest();
                if (object.title != null)
                    message.title = String(object.title);
                if (object.orchestratorModelId != null)
                    message.orchestratorModelId = String(object.orchestratorModelId);
                return message;
            };

            /**
             * Creates a plain object from a CreateConversationRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.conversations.CreateConversationRequest
             * @static
             * @param {ultra.conversations.CreateConversationRequest} message CreateConversationRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            CreateConversationRequest.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.defaults) {
                    object.title = "";
                    object.orchestratorModelId = "";
                }
                if (message.title != null && message.hasOwnProperty("title"))
                    object.title = message.title;
                if (message.orchestratorModelId != null && message.hasOwnProperty("orchestratorModelId"))
                    object.orchestratorModelId = message.orchestratorModelId;
                return object;
            };

            /**
             * Converts this CreateConversationRequest to JSON.
             * @function toJSON
             * @memberof ultra.conversations.CreateConversationRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            CreateConversationRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for CreateConversationRequest
             * @function getTypeUrl
             * @memberof ultra.conversations.CreateConversationRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            CreateConversationRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.conversations.CreateConversationRequest";
            };

            return CreateConversationRequest;
        })();

        conversations.UpdateConversationRequest = (function() {

            /**
             * Properties of an UpdateConversationRequest.
             * @memberof ultra.conversations
             * @interface IUpdateConversationRequest
             * @property {string|null} [id] UpdateConversationRequest id
             * @property {string|null} [title] UpdateConversationRequest title
             * @property {string|null} [status] UpdateConversationRequest status
             * @property {string|null} [orchestratorModelId] UpdateConversationRequest orchestratorModelId
             */

            /**
             * Constructs a new UpdateConversationRequest.
             * @memberof ultra.conversations
             * @classdesc Represents an UpdateConversationRequest.
             * @implements IUpdateConversationRequest
             * @constructor
             * @param {ultra.conversations.IUpdateConversationRequest=} [properties] Properties to set
             */
            function UpdateConversationRequest(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * UpdateConversationRequest id.
             * @member {string} id
             * @memberof ultra.conversations.UpdateConversationRequest
             * @instance
             */
            UpdateConversationRequest.prototype.id = "";

            /**
             * UpdateConversationRequest title.
             * @member {string} title
             * @memberof ultra.conversations.UpdateConversationRequest
             * @instance
             */
            UpdateConversationRequest.prototype.title = "";

            /**
             * UpdateConversationRequest status.
             * @member {string} status
             * @memberof ultra.conversations.UpdateConversationRequest
             * @instance
             */
            UpdateConversationRequest.prototype.status = "";

            /**
             * UpdateConversationRequest orchestratorModelId.
             * @member {string} orchestratorModelId
             * @memberof ultra.conversations.UpdateConversationRequest
             * @instance
             */
            UpdateConversationRequest.prototype.orchestratorModelId = "";

            /**
             * Creates a new UpdateConversationRequest instance using the specified properties.
             * @function create
             * @memberof ultra.conversations.UpdateConversationRequest
             * @static
             * @param {ultra.conversations.IUpdateConversationRequest=} [properties] Properties to set
             * @returns {ultra.conversations.UpdateConversationRequest} UpdateConversationRequest instance
             */
            UpdateConversationRequest.create = function create(properties) {
                return new UpdateConversationRequest(properties);
            };

            /**
             * Encodes the specified UpdateConversationRequest message. Does not implicitly {@link ultra.conversations.UpdateConversationRequest.verify|verify} messages.
             * @function encode
             * @memberof ultra.conversations.UpdateConversationRequest
             * @static
             * @param {ultra.conversations.IUpdateConversationRequest} message UpdateConversationRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            UpdateConversationRequest.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
                if (message.title != null && Object.hasOwnProperty.call(message, "title"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.title);
                if (message.status != null && Object.hasOwnProperty.call(message, "status"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.status);
                if (message.orchestratorModelId != null && Object.hasOwnProperty.call(message, "orchestratorModelId"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.orchestratorModelId);
                return writer;
            };

            /**
             * Encodes the specified UpdateConversationRequest message, length delimited. Does not implicitly {@link ultra.conversations.UpdateConversationRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.conversations.UpdateConversationRequest
             * @static
             * @param {ultra.conversations.IUpdateConversationRequest} message UpdateConversationRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            UpdateConversationRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an UpdateConversationRequest message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.conversations.UpdateConversationRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.conversations.UpdateConversationRequest} UpdateConversationRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            UpdateConversationRequest.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.conversations.UpdateConversationRequest();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.id = reader.string();
                            break;
                        }
                    case 2: {
                            message.title = reader.string();
                            break;
                        }
                    case 3: {
                            message.status = reader.string();
                            break;
                        }
                    case 4: {
                            message.orchestratorModelId = reader.string();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes an UpdateConversationRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.conversations.UpdateConversationRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.conversations.UpdateConversationRequest} UpdateConversationRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            UpdateConversationRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an UpdateConversationRequest message.
             * @function verify
             * @memberof ultra.conversations.UpdateConversationRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            UpdateConversationRequest.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.id != null && message.hasOwnProperty("id"))
                    if (!$util.isString(message.id))
                        return "id: string expected";
                if (message.title != null && message.hasOwnProperty("title"))
                    if (!$util.isString(message.title))
                        return "title: string expected";
                if (message.status != null && message.hasOwnProperty("status"))
                    if (!$util.isString(message.status))
                        return "status: string expected";
                if (message.orchestratorModelId != null && message.hasOwnProperty("orchestratorModelId"))
                    if (!$util.isString(message.orchestratorModelId))
                        return "orchestratorModelId: string expected";
                return null;
            };

            /**
             * Creates an UpdateConversationRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.conversations.UpdateConversationRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.conversations.UpdateConversationRequest} UpdateConversationRequest
             */
            UpdateConversationRequest.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.conversations.UpdateConversationRequest)
                    return object;
                let message = new $root.ultra.conversations.UpdateConversationRequest();
                if (object.id != null)
                    message.id = String(object.id);
                if (object.title != null)
                    message.title = String(object.title);
                if (object.status != null)
                    message.status = String(object.status);
                if (object.orchestratorModelId != null)
                    message.orchestratorModelId = String(object.orchestratorModelId);
                return message;
            };

            /**
             * Creates a plain object from an UpdateConversationRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.conversations.UpdateConversationRequest
             * @static
             * @param {ultra.conversations.UpdateConversationRequest} message UpdateConversationRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            UpdateConversationRequest.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.defaults) {
                    object.id = "";
                    object.title = "";
                    object.status = "";
                    object.orchestratorModelId = "";
                }
                if (message.id != null && message.hasOwnProperty("id"))
                    object.id = message.id;
                if (message.title != null && message.hasOwnProperty("title"))
                    object.title = message.title;
                if (message.status != null && message.hasOwnProperty("status"))
                    object.status = message.status;
                if (message.orchestratorModelId != null && message.hasOwnProperty("orchestratorModelId"))
                    object.orchestratorModelId = message.orchestratorModelId;
                return object;
            };

            /**
             * Converts this UpdateConversationRequest to JSON.
             * @function toJSON
             * @memberof ultra.conversations.UpdateConversationRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            UpdateConversationRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for UpdateConversationRequest
             * @function getTypeUrl
             * @memberof ultra.conversations.UpdateConversationRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            UpdateConversationRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.conversations.UpdateConversationRequest";
            };

            return UpdateConversationRequest;
        })();

        conversations.SendMessageRequest = (function() {

            /**
             * Properties of a SendMessageRequest.
             * @memberof ultra.conversations
             * @interface ISendMessageRequest
             * @property {string|null} [conversationId] SendMessageRequest conversationId
             * @property {string|null} [content] SendMessageRequest content
             */

            /**
             * Constructs a new SendMessageRequest.
             * @memberof ultra.conversations
             * @classdesc Represents a SendMessageRequest.
             * @implements ISendMessageRequest
             * @constructor
             * @param {ultra.conversations.ISendMessageRequest=} [properties] Properties to set
             */
            function SendMessageRequest(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * SendMessageRequest conversationId.
             * @member {string} conversationId
             * @memberof ultra.conversations.SendMessageRequest
             * @instance
             */
            SendMessageRequest.prototype.conversationId = "";

            /**
             * SendMessageRequest content.
             * @member {string} content
             * @memberof ultra.conversations.SendMessageRequest
             * @instance
             */
            SendMessageRequest.prototype.content = "";

            /**
             * Creates a new SendMessageRequest instance using the specified properties.
             * @function create
             * @memberof ultra.conversations.SendMessageRequest
             * @static
             * @param {ultra.conversations.ISendMessageRequest=} [properties] Properties to set
             * @returns {ultra.conversations.SendMessageRequest} SendMessageRequest instance
             */
            SendMessageRequest.create = function create(properties) {
                return new SendMessageRequest(properties);
            };

            /**
             * Encodes the specified SendMessageRequest message. Does not implicitly {@link ultra.conversations.SendMessageRequest.verify|verify} messages.
             * @function encode
             * @memberof ultra.conversations.SendMessageRequest
             * @static
             * @param {ultra.conversations.ISendMessageRequest} message SendMessageRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SendMessageRequest.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.conversationId != null && Object.hasOwnProperty.call(message, "conversationId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.conversationId);
                if (message.content != null && Object.hasOwnProperty.call(message, "content"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.content);
                return writer;
            };

            /**
             * Encodes the specified SendMessageRequest message, length delimited. Does not implicitly {@link ultra.conversations.SendMessageRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.conversations.SendMessageRequest
             * @static
             * @param {ultra.conversations.ISendMessageRequest} message SendMessageRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SendMessageRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a SendMessageRequest message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.conversations.SendMessageRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.conversations.SendMessageRequest} SendMessageRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SendMessageRequest.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.conversations.SendMessageRequest();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.conversationId = reader.string();
                            break;
                        }
                    case 2: {
                            message.content = reader.string();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a SendMessageRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.conversations.SendMessageRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.conversations.SendMessageRequest} SendMessageRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SendMessageRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a SendMessageRequest message.
             * @function verify
             * @memberof ultra.conversations.SendMessageRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            SendMessageRequest.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.conversationId != null && message.hasOwnProperty("conversationId"))
                    if (!$util.isString(message.conversationId))
                        return "conversationId: string expected";
                if (message.content != null && message.hasOwnProperty("content"))
                    if (!$util.isString(message.content))
                        return "content: string expected";
                return null;
            };

            /**
             * Creates a SendMessageRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.conversations.SendMessageRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.conversations.SendMessageRequest} SendMessageRequest
             */
            SendMessageRequest.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.conversations.SendMessageRequest)
                    return object;
                let message = new $root.ultra.conversations.SendMessageRequest();
                if (object.conversationId != null)
                    message.conversationId = String(object.conversationId);
                if (object.content != null)
                    message.content = String(object.content);
                return message;
            };

            /**
             * Creates a plain object from a SendMessageRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.conversations.SendMessageRequest
             * @static
             * @param {ultra.conversations.SendMessageRequest} message SendMessageRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            SendMessageRequest.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.defaults) {
                    object.conversationId = "";
                    object.content = "";
                }
                if (message.conversationId != null && message.hasOwnProperty("conversationId"))
                    object.conversationId = message.conversationId;
                if (message.content != null && message.hasOwnProperty("content"))
                    object.content = message.content;
                return object;
            };

            /**
             * Converts this SendMessageRequest to JSON.
             * @function toJSON
             * @memberof ultra.conversations.SendMessageRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            SendMessageRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for SendMessageRequest
             * @function getTypeUrl
             * @memberof ultra.conversations.SendMessageRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            SendMessageRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.conversations.SendMessageRequest";
            };

            return SendMessageRequest;
        })();

        conversations.StreamEvent = (function() {

            /**
             * Properties of a StreamEvent.
             * @memberof ultra.conversations
             * @interface IStreamEvent
             * @property {string|null} [type] StreamEvent type
             * @property {string|null} [payload] StreamEvent payload
             */

            /**
             * Constructs a new StreamEvent.
             * @memberof ultra.conversations
             * @classdesc Represents a StreamEvent.
             * @implements IStreamEvent
             * @constructor
             * @param {ultra.conversations.IStreamEvent=} [properties] Properties to set
             */
            function StreamEvent(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * StreamEvent type.
             * @member {string} type
             * @memberof ultra.conversations.StreamEvent
             * @instance
             */
            StreamEvent.prototype.type = "";

            /**
             * StreamEvent payload.
             * @member {string} payload
             * @memberof ultra.conversations.StreamEvent
             * @instance
             */
            StreamEvent.prototype.payload = "";

            /**
             * Creates a new StreamEvent instance using the specified properties.
             * @function create
             * @memberof ultra.conversations.StreamEvent
             * @static
             * @param {ultra.conversations.IStreamEvent=} [properties] Properties to set
             * @returns {ultra.conversations.StreamEvent} StreamEvent instance
             */
            StreamEvent.create = function create(properties) {
                return new StreamEvent(properties);
            };

            /**
             * Encodes the specified StreamEvent message. Does not implicitly {@link ultra.conversations.StreamEvent.verify|verify} messages.
             * @function encode
             * @memberof ultra.conversations.StreamEvent
             * @static
             * @param {ultra.conversations.IStreamEvent} message StreamEvent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            StreamEvent.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.type != null && Object.hasOwnProperty.call(message, "type"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.type);
                if (message.payload != null && Object.hasOwnProperty.call(message, "payload"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.payload);
                return writer;
            };

            /**
             * Encodes the specified StreamEvent message, length delimited. Does not implicitly {@link ultra.conversations.StreamEvent.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.conversations.StreamEvent
             * @static
             * @param {ultra.conversations.IStreamEvent} message StreamEvent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            StreamEvent.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a StreamEvent message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.conversations.StreamEvent
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.conversations.StreamEvent} StreamEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            StreamEvent.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.conversations.StreamEvent();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.type = reader.string();
                            break;
                        }
                    case 2: {
                            message.payload = reader.string();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a StreamEvent message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.conversations.StreamEvent
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.conversations.StreamEvent} StreamEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            StreamEvent.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a StreamEvent message.
             * @function verify
             * @memberof ultra.conversations.StreamEvent
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            StreamEvent.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.type != null && message.hasOwnProperty("type"))
                    if (!$util.isString(message.type))
                        return "type: string expected";
                if (message.payload != null && message.hasOwnProperty("payload"))
                    if (!$util.isString(message.payload))
                        return "payload: string expected";
                return null;
            };

            /**
             * Creates a StreamEvent message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.conversations.StreamEvent
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.conversations.StreamEvent} StreamEvent
             */
            StreamEvent.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.conversations.StreamEvent)
                    return object;
                let message = new $root.ultra.conversations.StreamEvent();
                if (object.type != null)
                    message.type = String(object.type);
                if (object.payload != null)
                    message.payload = String(object.payload);
                return message;
            };

            /**
             * Creates a plain object from a StreamEvent message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.conversations.StreamEvent
             * @static
             * @param {ultra.conversations.StreamEvent} message StreamEvent
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            StreamEvent.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.defaults) {
                    object.type = "";
                    object.payload = "";
                }
                if (message.type != null && message.hasOwnProperty("type"))
                    object.type = message.type;
                if (message.payload != null && message.hasOwnProperty("payload"))
                    object.payload = message.payload;
                return object;
            };

            /**
             * Converts this StreamEvent to JSON.
             * @function toJSON
             * @memberof ultra.conversations.StreamEvent
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            StreamEvent.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for StreamEvent
             * @function getTypeUrl
             * @memberof ultra.conversations.StreamEvent
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            StreamEvent.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.conversations.StreamEvent";
            };

            return StreamEvent;
        })();

        conversations.ConversationService = (function() {

            /**
             * Constructs a new ConversationService service.
             * @memberof ultra.conversations
             * @classdesc Represents a ConversationService
             * @extends $protobuf.rpc.Service
             * @constructor
             * @param {$protobuf.RPCImpl} rpcImpl RPC implementation
             * @param {boolean} [requestDelimited=false] Whether requests are length-delimited
             * @param {boolean} [responseDelimited=false] Whether responses are length-delimited
             */
            function ConversationService(rpcImpl, requestDelimited, responseDelimited) {
                $protobuf.rpc.Service.call(this, rpcImpl, requestDelimited, responseDelimited);
            }

            (ConversationService.prototype = Object.create($protobuf.rpc.Service.prototype)).constructor = ConversationService;

            /**
             * Creates new ConversationService service using the specified rpc implementation.
             * @function create
             * @memberof ultra.conversations.ConversationService
             * @static
             * @param {$protobuf.RPCImpl} rpcImpl RPC implementation
             * @param {boolean} [requestDelimited=false] Whether requests are length-delimited
             * @param {boolean} [responseDelimited=false] Whether responses are length-delimited
             * @returns {ConversationService} RPC service. Useful where requests and/or responses are streamed.
             */
            ConversationService.create = function create(rpcImpl, requestDelimited, responseDelimited) {
                return new this(rpcImpl, requestDelimited, responseDelimited);
            };

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#listConversations}.
             * @memberof ultra.conversations.ConversationService
             * @typedef ListConversationsCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.conversations.ConversationList} [response] ConversationList
             */

            /**
             * Calls ListConversations.
             * @function listConversations
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.common.IEmpty} request Empty message or plain object
             * @param {ultra.conversations.ConversationService.ListConversationsCallback} callback Node-style callback called with the error, if any, and ConversationList
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(ConversationService.prototype.listConversations = function listConversations(request, callback) {
                return this.rpcCall(listConversations, $root.ultra.common.Empty, $root.ultra.conversations.ConversationList, request, callback);
            }, "name", { value: "ListConversations" });

            /**
             * Calls ListConversations.
             * @function listConversations
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.common.IEmpty} request Empty message or plain object
             * @returns {Promise<ultra.conversations.ConversationList>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#getConversation}.
             * @memberof ultra.conversations.ConversationService
             * @typedef GetConversationCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.conversations.Conversation} [response] Conversation
             */

            /**
             * Calls GetConversation.
             * @function getConversation
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @param {ultra.conversations.ConversationService.GetConversationCallback} callback Node-style callback called with the error, if any, and Conversation
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(ConversationService.prototype.getConversation = function getConversation(request, callback) {
                return this.rpcCall(getConversation, $root.ultra.common.IdRequest, $root.ultra.conversations.Conversation, request, callback);
            }, "name", { value: "GetConversation" });

            /**
             * Calls GetConversation.
             * @function getConversation
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @returns {Promise<ultra.conversations.Conversation>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#createConversation}.
             * @memberof ultra.conversations.ConversationService
             * @typedef CreateConversationCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.conversations.Conversation} [response] Conversation
             */

            /**
             * Calls CreateConversation.
             * @function createConversation
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.conversations.ICreateConversationRequest} request CreateConversationRequest message or plain object
             * @param {ultra.conversations.ConversationService.CreateConversationCallback} callback Node-style callback called with the error, if any, and Conversation
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(ConversationService.prototype.createConversation = function createConversation(request, callback) {
                return this.rpcCall(createConversation, $root.ultra.conversations.CreateConversationRequest, $root.ultra.conversations.Conversation, request, callback);
            }, "name", { value: "CreateConversation" });

            /**
             * Calls CreateConversation.
             * @function createConversation
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.conversations.ICreateConversationRequest} request CreateConversationRequest message or plain object
             * @returns {Promise<ultra.conversations.Conversation>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#updateConversation}.
             * @memberof ultra.conversations.ConversationService
             * @typedef UpdateConversationCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.conversations.Conversation} [response] Conversation
             */

            /**
             * Calls UpdateConversation.
             * @function updateConversation
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.conversations.IUpdateConversationRequest} request UpdateConversationRequest message or plain object
             * @param {ultra.conversations.ConversationService.UpdateConversationCallback} callback Node-style callback called with the error, if any, and Conversation
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(ConversationService.prototype.updateConversation = function updateConversation(request, callback) {
                return this.rpcCall(updateConversation, $root.ultra.conversations.UpdateConversationRequest, $root.ultra.conversations.Conversation, request, callback);
            }, "name", { value: "UpdateConversation" });

            /**
             * Calls UpdateConversation.
             * @function updateConversation
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.conversations.IUpdateConversationRequest} request UpdateConversationRequest message or plain object
             * @returns {Promise<ultra.conversations.Conversation>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#deleteConversation}.
             * @memberof ultra.conversations.ConversationService
             * @typedef DeleteConversationCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.common.DeleteResponse} [response] DeleteResponse
             */

            /**
             * Calls DeleteConversation.
             * @function deleteConversation
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @param {ultra.conversations.ConversationService.DeleteConversationCallback} callback Node-style callback called with the error, if any, and DeleteResponse
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(ConversationService.prototype.deleteConversation = function deleteConversation(request, callback) {
                return this.rpcCall(deleteConversation, $root.ultra.common.IdRequest, $root.ultra.common.DeleteResponse, request, callback);
            }, "name", { value: "DeleteConversation" });

            /**
             * Calls DeleteConversation.
             * @function deleteConversation
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @returns {Promise<ultra.common.DeleteResponse>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#getMessages}.
             * @memberof ultra.conversations.ConversationService
             * @typedef GetMessagesCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.conversations.MessageList} [response] MessageList
             */

            /**
             * Calls GetMessages.
             * @function getMessages
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @param {ultra.conversations.ConversationService.GetMessagesCallback} callback Node-style callback called with the error, if any, and MessageList
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(ConversationService.prototype.getMessages = function getMessages(request, callback) {
                return this.rpcCall(getMessages, $root.ultra.common.IdRequest, $root.ultra.conversations.MessageList, request, callback);
            }, "name", { value: "GetMessages" });

            /**
             * Calls GetMessages.
             * @function getMessages
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @returns {Promise<ultra.conversations.MessageList>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#sendMessage}.
             * @memberof ultra.conversations.ConversationService
             * @typedef SendMessageCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.conversations.Message} [response] Message
             */

            /**
             * Calls SendMessage.
             * @function sendMessage
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.conversations.ISendMessageRequest} request SendMessageRequest message or plain object
             * @param {ultra.conversations.ConversationService.SendMessageCallback} callback Node-style callback called with the error, if any, and Message
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(ConversationService.prototype.sendMessage = function sendMessage(request, callback) {
                return this.rpcCall(sendMessage, $root.ultra.conversations.SendMessageRequest, $root.ultra.conversations.Message, request, callback);
            }, "name", { value: "SendMessage" });

            /**
             * Calls SendMessage.
             * @function sendMessage
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.conversations.ISendMessageRequest} request SendMessageRequest message or plain object
             * @returns {Promise<ultra.conversations.Message>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#streamConversation}.
             * @memberof ultra.conversations.ConversationService
             * @typedef StreamConversationCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.conversations.StreamEvent} [response] StreamEvent
             */

            /**
             * Calls StreamConversation.
             * @function streamConversation
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @param {ultra.conversations.ConversationService.StreamConversationCallback} callback Node-style callback called with the error, if any, and StreamEvent
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(ConversationService.prototype.streamConversation = function streamConversation(request, callback) {
                return this.rpcCall(streamConversation, $root.ultra.common.IdRequest, $root.ultra.conversations.StreamEvent, request, callback);
            }, "name", { value: "StreamConversation" });

            /**
             * Calls StreamConversation.
             * @function streamConversation
             * @memberof ultra.conversations.ConversationService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @returns {Promise<ultra.conversations.StreamEvent>} Promise
             * @variation 2
             */

            return ConversationService;
        })();

        return conversations;
    })();

    ultra.models = (function() {

        /**
         * Namespace models.
         * @memberof ultra
         * @namespace
         */
        const models = {};

        models.Model = (function() {

            /**
             * Properties of a Model.
             * @memberof ultra.models
             * @interface IModel
             * @property {string|null} [id] Model id
             * @property {string|null} [name] Model name
             * @property {string|null} [provider] Model provider
             * @property {string|null} [modelId] Model modelId
             * @property {string|null} [baseUrl] Model baseUrl
             * @property {boolean|null} [enabled] Model enabled
             * @property {string|null} [capabilities] Model capabilities
             * @property {number|null} [contextWindow] Model contextWindow
             * @property {boolean|null} [isDefault] Model isDefault
             * @property {boolean|null} [isOrchestrator] Model isOrchestrator
             * @property {string|null} [speedTier] Model speedTier
             * @property {string|null} [notes] Model notes
             * @property {string|null} [authMethod] Model authMethod
             * @property {string|null} [connectionStatus] Model connectionStatus
             * @property {string|null} [connectionError] Model connectionError
             * @property {number|Long|null} [lastTestedAt] Model lastTestedAt
             * @property {number|null} [lastTestLatency] Model lastTestLatency
             * @property {number|Long|null} [createdAt] Model createdAt
             */

            /**
             * Constructs a new Model.
             * @memberof ultra.models
             * @classdesc Represents a Model.
             * @implements IModel
             * @constructor
             * @param {ultra.models.IModel=} [properties] Properties to set
             */
            function Model(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * Model id.
             * @member {string} id
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.id = "";

            /**
             * Model name.
             * @member {string} name
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.name = "";

            /**
             * Model provider.
             * @member {string} provider
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.provider = "";

            /**
             * Model modelId.
             * @member {string} modelId
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.modelId = "";

            /**
             * Model baseUrl.
             * @member {string} baseUrl
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.baseUrl = "";

            /**
             * Model enabled.
             * @member {boolean} enabled
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.enabled = false;

            /**
             * Model capabilities.
             * @member {string} capabilities
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.capabilities = "";

            /**
             * Model contextWindow.
             * @member {number} contextWindow
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.contextWindow = 0;

            /**
             * Model isDefault.
             * @member {boolean} isDefault
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.isDefault = false;

            /**
             * Model isOrchestrator.
             * @member {boolean} isOrchestrator
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.isOrchestrator = false;

            /**
             * Model speedTier.
             * @member {string} speedTier
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.speedTier = "";

            /**
             * Model notes.
             * @member {string} notes
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.notes = "";

            /**
             * Model authMethod.
             * @member {string} authMethod
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.authMethod = "";

            /**
             * Model connectionStatus.
             * @member {string} connectionStatus
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.connectionStatus = "";

            /**
             * Model connectionError.
             * @member {string} connectionError
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.connectionError = "";

            /**
             * Model lastTestedAt.
             * @member {number|Long} lastTestedAt
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.lastTestedAt = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * Model lastTestLatency.
             * @member {number} lastTestLatency
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.lastTestLatency = 0;

            /**
             * Model createdAt.
             * @member {number|Long} createdAt
             * @memberof ultra.models.Model
             * @instance
             */
            Model.prototype.createdAt = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * Creates a new Model instance using the specified properties.
             * @function create
             * @memberof ultra.models.Model
             * @static
             * @param {ultra.models.IModel=} [properties] Properties to set
             * @returns {ultra.models.Model} Model instance
             */
            Model.create = function create(properties) {
                return new Model(properties);
            };

            /**
             * Encodes the specified Model message. Does not implicitly {@link ultra.models.Model.verify|verify} messages.
             * @function encode
             * @memberof ultra.models.Model
             * @static
             * @param {ultra.models.IModel} message Model message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Model.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
                if (message.name != null && Object.hasOwnProperty.call(message, "name"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.name);
                if (message.provider != null && Object.hasOwnProperty.call(message, "provider"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.provider);
                if (message.modelId != null && Object.hasOwnProperty.call(message, "modelId"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.modelId);
                if (message.baseUrl != null && Object.hasOwnProperty.call(message, "baseUrl"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.baseUrl);
                if (message.enabled != null && Object.hasOwnProperty.call(message, "enabled"))
                    writer.uint32(/* id 6, wireType 0 =*/48).bool(message.enabled);
                if (message.capabilities != null && Object.hasOwnProperty.call(message, "capabilities"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.capabilities);
                if (message.contextWindow != null && Object.hasOwnProperty.call(message, "contextWindow"))
                    writer.uint32(/* id 8, wireType 0 =*/64).int32(message.contextWindow);
                if (message.isDefault != null && Object.hasOwnProperty.call(message, "isDefault"))
                    writer.uint32(/* id 9, wireType 0 =*/72).bool(message.isDefault);
                if (message.isOrchestrator != null && Object.hasOwnProperty.call(message, "isOrchestrator"))
                    writer.uint32(/* id 10, wireType 0 =*/80).bool(message.isOrchestrator);
                if (message.speedTier != null && Object.hasOwnProperty.call(message, "speedTier"))
                    writer.uint32(/* id 11, wireType 2 =*/90).string(message.speedTier);
                if (message.notes != null && Object.hasOwnProperty.call(message, "notes"))
                    writer.uint32(/* id 12, wireType 2 =*/98).string(message.notes);
                if (message.authMethod != null && Object.hasOwnProperty.call(message, "authMethod"))
                    writer.uint32(/* id 13, wireType 2 =*/106).string(message.authMethod);
                if (message.connectionStatus != null && Object.hasOwnProperty.call(message, "connectionStatus"))
                    writer.uint32(/* id 14, wireType 2 =*/114).string(message.connectionStatus);
                if (message.connectionError != null && Object.hasOwnProperty.call(message, "connectionError"))
                    writer.uint32(/* id 15, wireType 2 =*/122).string(message.connectionError);
                if (message.lastTestedAt != null && Object.hasOwnProperty.call(message, "lastTestedAt"))
                    writer.uint32(/* id 16, wireType 0 =*/128).int64(message.lastTestedAt);
                if (message.lastTestLatency != null && Object.hasOwnProperty.call(message, "lastTestLatency"))
                    writer.uint32(/* id 17, wireType 0 =*/136).int32(message.lastTestLatency);
                if (message.createdAt != null && Object.hasOwnProperty.call(message, "createdAt"))
                    writer.uint32(/* id 18, wireType 0 =*/144).int64(message.createdAt);
                return writer;
            };

            /**
             * Encodes the specified Model message, length delimited. Does not implicitly {@link ultra.models.Model.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.models.Model
             * @static
             * @param {ultra.models.IModel} message Model message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Model.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a Model message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.models.Model
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.models.Model} Model
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Model.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.models.Model();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.id = reader.string();
                            break;
                        }
                    case 2: {
                            message.name = reader.string();
                            break;
                        }
                    case 3: {
                            message.provider = reader.string();
                            break;
                        }
                    case 4: {
                            message.modelId = reader.string();
                            break;
                        }
                    case 5: {
                            message.baseUrl = reader.string();
                            break;
                        }
                    case 6: {
                            message.enabled = reader.bool();
                            break;
                        }
                    case 7: {
                            message.capabilities = reader.string();
                            break;
                        }
                    case 8: {
                            message.contextWindow = reader.int32();
                            break;
                        }
                    case 9: {
                            message.isDefault = reader.bool();
                            break;
                        }
                    case 10: {
                            message.isOrchestrator = reader.bool();
                            break;
                        }
                    case 11: {
                            message.speedTier = reader.string();
                            break;
                        }
                    case 12: {
                            message.notes = reader.string();
                            break;
                        }
                    case 13: {
                            message.authMethod = reader.string();
                            break;
                        }
                    case 14: {
                            message.connectionStatus = reader.string();
                            break;
                        }
                    case 15: {
                            message.connectionError = reader.string();
                            break;
                        }
                    case 16: {
                            message.lastTestedAt = reader.int64();
                            break;
                        }
                    case 17: {
                            message.lastTestLatency = reader.int32();
                            break;
                        }
                    case 18: {
                            message.createdAt = reader.int64();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a Model message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.models.Model
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.models.Model} Model
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Model.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a Model message.
             * @function verify
             * @memberof ultra.models.Model
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            Model.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.id != null && message.hasOwnProperty("id"))
                    if (!$util.isString(message.id))
                        return "id: string expected";
                if (message.name != null && message.hasOwnProperty("name"))
                    if (!$util.isString(message.name))
                        return "name: string expected";
                if (message.provider != null && message.hasOwnProperty("provider"))
                    if (!$util.isString(message.provider))
                        return "provider: string expected";
                if (message.modelId != null && message.hasOwnProperty("modelId"))
                    if (!$util.isString(message.modelId))
                        return "modelId: string expected";
                if (message.baseUrl != null && message.hasOwnProperty("baseUrl"))
                    if (!$util.isString(message.baseUrl))
                        return "baseUrl: string expected";
                if (message.enabled != null && message.hasOwnProperty("enabled"))
                    if (typeof message.enabled !== "boolean")
                        return "enabled: boolean expected";
                if (message.capabilities != null && message.hasOwnProperty("capabilities"))
                    if (!$util.isString(message.capabilities))
                        return "capabilities: string expected";
                if (message.contextWindow != null && message.hasOwnProperty("contextWindow"))
                    if (!$util.isInteger(message.contextWindow))
                        return "contextWindow: integer expected";
                if (message.isDefault != null && message.hasOwnProperty("isDefault"))
                    if (typeof message.isDefault !== "boolean")
                        return "isDefault: boolean expected";
                if (message.isOrchestrator != null && message.hasOwnProperty("isOrchestrator"))
                    if (typeof message.isOrchestrator !== "boolean")
                        return "isOrchestrator: boolean expected";
                if (message.speedTier != null && message.hasOwnProperty("speedTier"))
                    if (!$util.isString(message.speedTier))
                        return "speedTier: string expected";
                if (message.notes != null && message.hasOwnProperty("notes"))
                    if (!$util.isString(message.notes))
                        return "notes: string expected";
                if (message.authMethod != null && message.hasOwnProperty("authMethod"))
                    if (!$util.isString(message.authMethod))
                        return "authMethod: string expected";
                if (message.connectionStatus != null && message.hasOwnProperty("connectionStatus"))
                    if (!$util.isString(message.connectionStatus))
                        return "connectionStatus: string expected";
                if (message.connectionError != null && message.hasOwnProperty("connectionError"))
                    if (!$util.isString(message.connectionError))
                        return "connectionError: string expected";
                if (message.lastTestedAt != null && message.hasOwnProperty("lastTestedAt"))
                    if (!$util.isInteger(message.lastTestedAt) && !(message.lastTestedAt && $util.isInteger(message.lastTestedAt.low) && $util.isInteger(message.lastTestedAt.high)))
                        return "lastTestedAt: integer|Long expected";
                if (message.lastTestLatency != null && message.hasOwnProperty("lastTestLatency"))
                    if (!$util.isInteger(message.lastTestLatency))
                        return "lastTestLatency: integer expected";
                if (message.createdAt != null && message.hasOwnProperty("createdAt"))
                    if (!$util.isInteger(message.createdAt) && !(message.createdAt && $util.isInteger(message.createdAt.low) && $util.isInteger(message.createdAt.high)))
                        return "createdAt: integer|Long expected";
                return null;
            };

            /**
             * Creates a Model message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.models.Model
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.models.Model} Model
             */
            Model.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.models.Model)
                    return object;
                let message = new $root.ultra.models.Model();
                if (object.id != null)
                    message.id = String(object.id);
                if (object.name != null)
                    message.name = String(object.name);
                if (object.provider != null)
                    message.provider = String(object.provider);
                if (object.modelId != null)
                    message.modelId = String(object.modelId);
                if (object.baseUrl != null)
                    message.baseUrl = String(object.baseUrl);
                if (object.enabled != null)
                    message.enabled = Boolean(object.enabled);
                if (object.capabilities != null)
                    message.capabilities = String(object.capabilities);
                if (object.contextWindow != null)
                    message.contextWindow = object.contextWindow | 0;
                if (object.isDefault != null)
                    message.isDefault = Boolean(object.isDefault);
                if (object.isOrchestrator != null)
                    message.isOrchestrator = Boolean(object.isOrchestrator);
                if (object.speedTier != null)
                    message.speedTier = String(object.speedTier);
                if (object.notes != null)
                    message.notes = String(object.notes);
                if (object.authMethod != null)
                    message.authMethod = String(object.authMethod);
                if (object.connectionStatus != null)
                    message.connectionStatus = String(object.connectionStatus);
                if (object.connectionError != null)
                    message.connectionError = String(object.connectionError);
                if (object.lastTestedAt != null)
                    if ($util.Long)
                        (message.lastTestedAt = $util.Long.fromValue(object.lastTestedAt)).unsigned = false;
                    else if (typeof object.lastTestedAt === "string")
                        message.lastTestedAt = parseInt(object.lastTestedAt, 10);
                    else if (typeof object.lastTestedAt === "number")
                        message.lastTestedAt = object.lastTestedAt;
                    else if (typeof object.lastTestedAt === "object")
                        message.lastTestedAt = new $util.LongBits(object.lastTestedAt.low >>> 0, object.lastTestedAt.high >>> 0).toNumber();
                if (object.lastTestLatency != null)
                    message.lastTestLatency = object.lastTestLatency | 0;
                if (object.createdAt != null)
                    if ($util.Long)
                        (message.createdAt = $util.Long.fromValue(object.createdAt)).unsigned = false;
                    else if (typeof object.createdAt === "string")
                        message.createdAt = parseInt(object.createdAt, 10);
                    else if (typeof object.createdAt === "number")
                        message.createdAt = object.createdAt;
                    else if (typeof object.createdAt === "object")
                        message.createdAt = new $util.LongBits(object.createdAt.low >>> 0, object.createdAt.high >>> 0).toNumber();
                return message;
            };

            /**
             * Creates a plain object from a Model message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.models.Model
             * @static
             * @param {ultra.models.Model} message Model
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Model.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.defaults) {
                    object.id = "";
                    object.name = "";
                    object.provider = "";
                    object.modelId = "";
                    object.baseUrl = "";
                    object.enabled = false;
                    object.capabilities = "";
                    object.contextWindow = 0;
                    object.isDefault = false;
                    object.isOrchestrator = false;
                    object.speedTier = "";
                    object.notes = "";
                    object.authMethod = "";
                    object.connectionStatus = "";
                    object.connectionError = "";
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.lastTestedAt = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.lastTestedAt = options.longs === String ? "0" : 0;
                    object.lastTestLatency = 0;
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.createdAt = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.createdAt = options.longs === String ? "0" : 0;
                }
                if (message.id != null && message.hasOwnProperty("id"))
                    object.id = message.id;
                if (message.name != null && message.hasOwnProperty("name"))
                    object.name = message.name;
                if (message.provider != null && message.hasOwnProperty("provider"))
                    object.provider = message.provider;
                if (message.modelId != null && message.hasOwnProperty("modelId"))
                    object.modelId = message.modelId;
                if (message.baseUrl != null && message.hasOwnProperty("baseUrl"))
                    object.baseUrl = message.baseUrl;
                if (message.enabled != null && message.hasOwnProperty("enabled"))
                    object.enabled = message.enabled;
                if (message.capabilities != null && message.hasOwnProperty("capabilities"))
                    object.capabilities = message.capabilities;
                if (message.contextWindow != null && message.hasOwnProperty("contextWindow"))
                    object.contextWindow = message.contextWindow;
                if (message.isDefault != null && message.hasOwnProperty("isDefault"))
                    object.isDefault = message.isDefault;
                if (message.isOrchestrator != null && message.hasOwnProperty("isOrchestrator"))
                    object.isOrchestrator = message.isOrchestrator;
                if (message.speedTier != null && message.hasOwnProperty("speedTier"))
                    object.speedTier = message.speedTier;
                if (message.notes != null && message.hasOwnProperty("notes"))
                    object.notes = message.notes;
                if (message.authMethod != null && message.hasOwnProperty("authMethod"))
                    object.authMethod = message.authMethod;
                if (message.connectionStatus != null && message.hasOwnProperty("connectionStatus"))
                    object.connectionStatus = message.connectionStatus;
                if (message.connectionError != null && message.hasOwnProperty("connectionError"))
                    object.connectionError = message.connectionError;
                if (message.lastTestedAt != null && message.hasOwnProperty("lastTestedAt"))
                    if (typeof message.lastTestedAt === "number")
                        object.lastTestedAt = options.longs === String ? String(message.lastTestedAt) : message.lastTestedAt;
                    else
                        object.lastTestedAt = options.longs === String ? $util.Long.prototype.toString.call(message.lastTestedAt) : options.longs === Number ? new $util.LongBits(message.lastTestedAt.low >>> 0, message.lastTestedAt.high >>> 0).toNumber() : message.lastTestedAt;
                if (message.lastTestLatency != null && message.hasOwnProperty("lastTestLatency"))
                    object.lastTestLatency = message.lastTestLatency;
                if (message.createdAt != null && message.hasOwnProperty("createdAt"))
                    if (typeof message.createdAt === "number")
                        object.createdAt = options.longs === String ? String(message.createdAt) : message.createdAt;
                    else
                        object.createdAt = options.longs === String ? $util.Long.prototype.toString.call(message.createdAt) : options.longs === Number ? new $util.LongBits(message.createdAt.low >>> 0, message.createdAt.high >>> 0).toNumber() : message.createdAt;
                return object;
            };

            /**
             * Converts this Model to JSON.
             * @function toJSON
             * @memberof ultra.models.Model
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Model.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for Model
             * @function getTypeUrl
             * @memberof ultra.models.Model
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            Model.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.models.Model";
            };

            return Model;
        })();

        models.ModelList = (function() {

            /**
             * Properties of a ModelList.
             * @memberof ultra.models
             * @interface IModelList
             * @property {Array.<ultra.models.IModel>|null} [models] ModelList models
             */

            /**
             * Constructs a new ModelList.
             * @memberof ultra.models
             * @classdesc Represents a ModelList.
             * @implements IModelList
             * @constructor
             * @param {ultra.models.IModelList=} [properties] Properties to set
             */
            function ModelList(properties) {
                this.models = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ModelList models.
             * @member {Array.<ultra.models.IModel>} models
             * @memberof ultra.models.ModelList
             * @instance
             */
            ModelList.prototype.models = $util.emptyArray;

            /**
             * Creates a new ModelList instance using the specified properties.
             * @function create
             * @memberof ultra.models.ModelList
             * @static
             * @param {ultra.models.IModelList=} [properties] Properties to set
             * @returns {ultra.models.ModelList} ModelList instance
             */
            ModelList.create = function create(properties) {
                return new ModelList(properties);
            };

            /**
             * Encodes the specified ModelList message. Does not implicitly {@link ultra.models.ModelList.verify|verify} messages.
             * @function encode
             * @memberof ultra.models.ModelList
             * @static
             * @param {ultra.models.IModelList} message ModelList message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ModelList.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.models != null && message.models.length)
                    for (let i = 0; i < message.models.length; ++i)
                        $root.ultra.models.Model.encode(message.models[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                return writer;
            };

            /**
             * Encodes the specified ModelList message, length delimited. Does not implicitly {@link ultra.models.ModelList.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.models.ModelList
             * @static
             * @param {ultra.models.IModelList} message ModelList message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ModelList.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ModelList message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.models.ModelList
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.models.ModelList} ModelList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ModelList.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.models.ModelList();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            if (!(message.models && message.models.length))
                                message.models = [];
                            message.models.push($root.ultra.models.Model.decode(reader, reader.uint32()));
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a ModelList message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.models.ModelList
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.models.ModelList} ModelList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ModelList.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a ModelList message.
             * @function verify
             * @memberof ultra.models.ModelList
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ModelList.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.models != null && message.hasOwnProperty("models")) {
                    if (!Array.isArray(message.models))
                        return "models: array expected";
                    for (let i = 0; i < message.models.length; ++i) {
                        let error = $root.ultra.models.Model.verify(message.models[i]);
                        if (error)
                            return "models." + error;
                    }
                }
                return null;
            };

            /**
             * Creates a ModelList message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.models.ModelList
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.models.ModelList} ModelList
             */
            ModelList.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.models.ModelList)
                    return object;
                let message = new $root.ultra.models.ModelList();
                if (object.models) {
                    if (!Array.isArray(object.models))
                        throw TypeError(".ultra.models.ModelList.models: array expected");
                    message.models = [];
                    for (let i = 0; i < object.models.length; ++i) {
                        if (typeof object.models[i] !== "object")
                            throw TypeError(".ultra.models.ModelList.models: object expected");
                        message.models[i] = $root.ultra.models.Model.fromObject(object.models[i]);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from a ModelList message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.models.ModelList
             * @static
             * @param {ultra.models.ModelList} message ModelList
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ModelList.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.arrays || options.defaults)
                    object.models = [];
                if (message.models && message.models.length) {
                    object.models = [];
                    for (let j = 0; j < message.models.length; ++j)
                        object.models[j] = $root.ultra.models.Model.toObject(message.models[j], options);
                }
                return object;
            };

            /**
             * Converts this ModelList to JSON.
             * @function toJSON
             * @memberof ultra.models.ModelList
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ModelList.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for ModelList
             * @function getTypeUrl
             * @memberof ultra.models.ModelList
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            ModelList.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.models.ModelList";
            };

            return ModelList;
        })();

        models.CreateModelRequest = (function() {

            /**
             * Properties of a CreateModelRequest.
             * @memberof ultra.models
             * @interface ICreateModelRequest
             * @property {string|null} [name] CreateModelRequest name
             * @property {string|null} [provider] CreateModelRequest provider
             * @property {string|null} [modelId] CreateModelRequest modelId
             * @property {string|null} [baseUrl] CreateModelRequest baseUrl
             * @property {string|null} [authMethod] CreateModelRequest authMethod
             * @property {string|null} [speedTier] CreateModelRequest speedTier
             * @property {string|null} [notes] CreateModelRequest notes
             * @property {number|null} [contextWindow] CreateModelRequest contextWindow
             */

            /**
             * Constructs a new CreateModelRequest.
             * @memberof ultra.models
             * @classdesc Represents a CreateModelRequest.
             * @implements ICreateModelRequest
             * @constructor
             * @param {ultra.models.ICreateModelRequest=} [properties] Properties to set
             */
            function CreateModelRequest(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * CreateModelRequest name.
             * @member {string} name
             * @memberof ultra.models.CreateModelRequest
             * @instance
             */
            CreateModelRequest.prototype.name = "";

            /**
             * CreateModelRequest provider.
             * @member {string} provider
             * @memberof ultra.models.CreateModelRequest
             * @instance
             */
            CreateModelRequest.prototype.provider = "";

            /**
             * CreateModelRequest modelId.
             * @member {string} modelId
             * @memberof ultra.models.CreateModelRequest
             * @instance
             */
            CreateModelRequest.prototype.modelId = "";

            /**
             * CreateModelRequest baseUrl.
             * @member {string} baseUrl
             * @memberof ultra.models.CreateModelRequest
             * @instance
             */
            CreateModelRequest.prototype.baseUrl = "";

            /**
             * CreateModelRequest authMethod.
             * @member {string} authMethod
             * @memberof ultra.models.CreateModelRequest
             * @instance
             */
            CreateModelRequest.prototype.authMethod = "";

            /**
             * CreateModelRequest speedTier.
             * @member {string} speedTier
             * @memberof ultra.models.CreateModelRequest
             * @instance
             */
            CreateModelRequest.prototype.speedTier = "";

            /**
             * CreateModelRequest notes.
             * @member {string} notes
             * @memberof ultra.models.CreateModelRequest
             * @instance
             */
            CreateModelRequest.prototype.notes = "";

            /**
             * CreateModelRequest contextWindow.
             * @member {number} contextWindow
             * @memberof ultra.models.CreateModelRequest
             * @instance
             */
            CreateModelRequest.prototype.contextWindow = 0;

            /**
             * Creates a new CreateModelRequest instance using the specified properties.
             * @function create
             * @memberof ultra.models.CreateModelRequest
             * @static
             * @param {ultra.models.ICreateModelRequest=} [properties] Properties to set
             * @returns {ultra.models.CreateModelRequest} CreateModelRequest instance
             */
            CreateModelRequest.create = function create(properties) {
                return new CreateModelRequest(properties);
            };

            /**
             * Encodes the specified CreateModelRequest message. Does not implicitly {@link ultra.models.CreateModelRequest.verify|verify} messages.
             * @function encode
             * @memberof ultra.models.CreateModelRequest
             * @static
             * @param {ultra.models.ICreateModelRequest} message CreateModelRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CreateModelRequest.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.name != null && Object.hasOwnProperty.call(message, "name"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.name);
                if (message.provider != null && Object.hasOwnProperty.call(message, "provider"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.provider);
                if (message.modelId != null && Object.hasOwnProperty.call(message, "modelId"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.modelId);
                if (message.baseUrl != null && Object.hasOwnProperty.call(message, "baseUrl"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.baseUrl);
                if (message.authMethod != null && Object.hasOwnProperty.call(message, "authMethod"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.authMethod);
                if (message.speedTier != null && Object.hasOwnProperty.call(message, "speedTier"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.speedTier);
                if (message.notes != null && Object.hasOwnProperty.call(message, "notes"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.notes);
                if (message.contextWindow != null && Object.hasOwnProperty.call(message, "contextWindow"))
                    writer.uint32(/* id 8, wireType 0 =*/64).int32(message.contextWindow);
                return writer;
            };

            /**
             * Encodes the specified CreateModelRequest message, length delimited. Does not implicitly {@link ultra.models.CreateModelRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.models.CreateModelRequest
             * @static
             * @param {ultra.models.ICreateModelRequest} message CreateModelRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CreateModelRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a CreateModelRequest message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.models.CreateModelRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.models.CreateModelRequest} CreateModelRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CreateModelRequest.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.models.CreateModelRequest();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.name = reader.string();
                            break;
                        }
                    case 2: {
                            message.provider = reader.string();
                            break;
                        }
                    case 3: {
                            message.modelId = reader.string();
                            break;
                        }
                    case 4: {
                            message.baseUrl = reader.string();
                            break;
                        }
                    case 5: {
                            message.authMethod = reader.string();
                            break;
                        }
                    case 6: {
                            message.speedTier = reader.string();
                            break;
                        }
                    case 7: {
                            message.notes = reader.string();
                            break;
                        }
                    case 8: {
                            message.contextWindow = reader.int32();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a CreateModelRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.models.CreateModelRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.models.CreateModelRequest} CreateModelRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CreateModelRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a CreateModelRequest message.
             * @function verify
             * @memberof ultra.models.CreateModelRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            CreateModelRequest.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.name != null && message.hasOwnProperty("name"))
                    if (!$util.isString(message.name))
                        return "name: string expected";
                if (message.provider != null && message.hasOwnProperty("provider"))
                    if (!$util.isString(message.provider))
                        return "provider: string expected";
                if (message.modelId != null && message.hasOwnProperty("modelId"))
                    if (!$util.isString(message.modelId))
                        return "modelId: string expected";
                if (message.baseUrl != null && message.hasOwnProperty("baseUrl"))
                    if (!$util.isString(message.baseUrl))
                        return "baseUrl: string expected";
                if (message.authMethod != null && message.hasOwnProperty("authMethod"))
                    if (!$util.isString(message.authMethod))
                        return "authMethod: string expected";
                if (message.speedTier != null && message.hasOwnProperty("speedTier"))
                    if (!$util.isString(message.speedTier))
                        return "speedTier: string expected";
                if (message.notes != null && message.hasOwnProperty("notes"))
                    if (!$util.isString(message.notes))
                        return "notes: string expected";
                if (message.contextWindow != null && message.hasOwnProperty("contextWindow"))
                    if (!$util.isInteger(message.contextWindow))
                        return "contextWindow: integer expected";
                return null;
            };

            /**
             * Creates a CreateModelRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.models.CreateModelRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.models.CreateModelRequest} CreateModelRequest
             */
            CreateModelRequest.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.models.CreateModelRequest)
                    return object;
                let message = new $root.ultra.models.CreateModelRequest();
                if (object.name != null)
                    message.name = String(object.name);
                if (object.provider != null)
                    message.provider = String(object.provider);
                if (object.modelId != null)
                    message.modelId = String(object.modelId);
                if (object.baseUrl != null)
                    message.baseUrl = String(object.baseUrl);
                if (object.authMethod != null)
                    message.authMethod = String(object.authMethod);
                if (object.speedTier != null)
                    message.speedTier = String(object.speedTier);
                if (object.notes != null)
                    message.notes = String(object.notes);
                if (object.contextWindow != null)
                    message.contextWindow = object.contextWindow | 0;
                return message;
            };

            /**
             * Creates a plain object from a CreateModelRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.models.CreateModelRequest
             * @static
             * @param {ultra.models.CreateModelRequest} message CreateModelRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            CreateModelRequest.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.defaults) {
                    object.name = "";
                    object.provider = "";
                    object.modelId = "";
                    object.baseUrl = "";
                    object.authMethod = "";
                    object.speedTier = "";
                    object.notes = "";
                    object.contextWindow = 0;
                }
                if (message.name != null && message.hasOwnProperty("name"))
                    object.name = message.name;
                if (message.provider != null && message.hasOwnProperty("provider"))
                    object.provider = message.provider;
                if (message.modelId != null && message.hasOwnProperty("modelId"))
                    object.modelId = message.modelId;
                if (message.baseUrl != null && message.hasOwnProperty("baseUrl"))
                    object.baseUrl = message.baseUrl;
                if (message.authMethod != null && message.hasOwnProperty("authMethod"))
                    object.authMethod = message.authMethod;
                if (message.speedTier != null && message.hasOwnProperty("speedTier"))
                    object.speedTier = message.speedTier;
                if (message.notes != null && message.hasOwnProperty("notes"))
                    object.notes = message.notes;
                if (message.contextWindow != null && message.hasOwnProperty("contextWindow"))
                    object.contextWindow = message.contextWindow;
                return object;
            };

            /**
             * Converts this CreateModelRequest to JSON.
             * @function toJSON
             * @memberof ultra.models.CreateModelRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            CreateModelRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for CreateModelRequest
             * @function getTypeUrl
             * @memberof ultra.models.CreateModelRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            CreateModelRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.models.CreateModelRequest";
            };

            return CreateModelRequest;
        })();

        models.TestModelResponse = (function() {

            /**
             * Properties of a TestModelResponse.
             * @memberof ultra.models
             * @interface ITestModelResponse
             * @property {boolean|null} [ok] TestModelResponse ok
             * @property {number|null} [latency] TestModelResponse latency
             * @property {string|null} [status] TestModelResponse status
             * @property {string|null} [error] TestModelResponse error
             */

            /**
             * Constructs a new TestModelResponse.
             * @memberof ultra.models
             * @classdesc Represents a TestModelResponse.
             * @implements ITestModelResponse
             * @constructor
             * @param {ultra.models.ITestModelResponse=} [properties] Properties to set
             */
            function TestModelResponse(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * TestModelResponse ok.
             * @member {boolean} ok
             * @memberof ultra.models.TestModelResponse
             * @instance
             */
            TestModelResponse.prototype.ok = false;

            /**
             * TestModelResponse latency.
             * @member {number} latency
             * @memberof ultra.models.TestModelResponse
             * @instance
             */
            TestModelResponse.prototype.latency = 0;

            /**
             * TestModelResponse status.
             * @member {string} status
             * @memberof ultra.models.TestModelResponse
             * @instance
             */
            TestModelResponse.prototype.status = "";

            /**
             * TestModelResponse error.
             * @member {string} error
             * @memberof ultra.models.TestModelResponse
             * @instance
             */
            TestModelResponse.prototype.error = "";

            /**
             * Creates a new TestModelResponse instance using the specified properties.
             * @function create
             * @memberof ultra.models.TestModelResponse
             * @static
             * @param {ultra.models.ITestModelResponse=} [properties] Properties to set
             * @returns {ultra.models.TestModelResponse} TestModelResponse instance
             */
            TestModelResponse.create = function create(properties) {
                return new TestModelResponse(properties);
            };

            /**
             * Encodes the specified TestModelResponse message. Does not implicitly {@link ultra.models.TestModelResponse.verify|verify} messages.
             * @function encode
             * @memberof ultra.models.TestModelResponse
             * @static
             * @param {ultra.models.ITestModelResponse} message TestModelResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            TestModelResponse.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.ok != null && Object.hasOwnProperty.call(message, "ok"))
                    writer.uint32(/* id 1, wireType 0 =*/8).bool(message.ok);
                if (message.latency != null && Object.hasOwnProperty.call(message, "latency"))
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.latency);
                if (message.status != null && Object.hasOwnProperty.call(message, "status"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.status);
                if (message.error != null && Object.hasOwnProperty.call(message, "error"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.error);
                return writer;
            };

            /**
             * Encodes the specified TestModelResponse message, length delimited. Does not implicitly {@link ultra.models.TestModelResponse.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.models.TestModelResponse
             * @static
             * @param {ultra.models.ITestModelResponse} message TestModelResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            TestModelResponse.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a TestModelResponse message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.models.TestModelResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.models.TestModelResponse} TestModelResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            TestModelResponse.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.models.TestModelResponse();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.ok = reader.bool();
                            break;
                        }
                    case 2: {
                            message.latency = reader.int32();
                            break;
                        }
                    case 3: {
                            message.status = reader.string();
                            break;
                        }
                    case 4: {
                            message.error = reader.string();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a TestModelResponse message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.models.TestModelResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.models.TestModelResponse} TestModelResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            TestModelResponse.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a TestModelResponse message.
             * @function verify
             * @memberof ultra.models.TestModelResponse
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            TestModelResponse.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.ok != null && message.hasOwnProperty("ok"))
                    if (typeof message.ok !== "boolean")
                        return "ok: boolean expected";
                if (message.latency != null && message.hasOwnProperty("latency"))
                    if (!$util.isInteger(message.latency))
                        return "latency: integer expected";
                if (message.status != null && message.hasOwnProperty("status"))
                    if (!$util.isString(message.status))
                        return "status: string expected";
                if (message.error != null && message.hasOwnProperty("error"))
                    if (!$util.isString(message.error))
                        return "error: string expected";
                return null;
            };

            /**
             * Creates a TestModelResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.models.TestModelResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.models.TestModelResponse} TestModelResponse
             */
            TestModelResponse.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.models.TestModelResponse)
                    return object;
                let message = new $root.ultra.models.TestModelResponse();
                if (object.ok != null)
                    message.ok = Boolean(object.ok);
                if (object.latency != null)
                    message.latency = object.latency | 0;
                if (object.status != null)
                    message.status = String(object.status);
                if (object.error != null)
                    message.error = String(object.error);
                return message;
            };

            /**
             * Creates a plain object from a TestModelResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.models.TestModelResponse
             * @static
             * @param {ultra.models.TestModelResponse} message TestModelResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            TestModelResponse.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.defaults) {
                    object.ok = false;
                    object.latency = 0;
                    object.status = "";
                    object.error = "";
                }
                if (message.ok != null && message.hasOwnProperty("ok"))
                    object.ok = message.ok;
                if (message.latency != null && message.hasOwnProperty("latency"))
                    object.latency = message.latency;
                if (message.status != null && message.hasOwnProperty("status"))
                    object.status = message.status;
                if (message.error != null && message.hasOwnProperty("error"))
                    object.error = message.error;
                return object;
            };

            /**
             * Converts this TestModelResponse to JSON.
             * @function toJSON
             * @memberof ultra.models.TestModelResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            TestModelResponse.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for TestModelResponse
             * @function getTypeUrl
             * @memberof ultra.models.TestModelResponse
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            TestModelResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.models.TestModelResponse";
            };

            return TestModelResponse;
        })();

        models.ModelService = (function() {

            /**
             * Constructs a new ModelService service.
             * @memberof ultra.models
             * @classdesc Represents a ModelService
             * @extends $protobuf.rpc.Service
             * @constructor
             * @param {$protobuf.RPCImpl} rpcImpl RPC implementation
             * @param {boolean} [requestDelimited=false] Whether requests are length-delimited
             * @param {boolean} [responseDelimited=false] Whether responses are length-delimited
             */
            function ModelService(rpcImpl, requestDelimited, responseDelimited) {
                $protobuf.rpc.Service.call(this, rpcImpl, requestDelimited, responseDelimited);
            }

            (ModelService.prototype = Object.create($protobuf.rpc.Service.prototype)).constructor = ModelService;

            /**
             * Creates new ModelService service using the specified rpc implementation.
             * @function create
             * @memberof ultra.models.ModelService
             * @static
             * @param {$protobuf.RPCImpl} rpcImpl RPC implementation
             * @param {boolean} [requestDelimited=false] Whether requests are length-delimited
             * @param {boolean} [responseDelimited=false] Whether responses are length-delimited
             * @returns {ModelService} RPC service. Useful where requests and/or responses are streamed.
             */
            ModelService.create = function create(rpcImpl, requestDelimited, responseDelimited) {
                return new this(rpcImpl, requestDelimited, responseDelimited);
            };

            /**
             * Callback as used by {@link ultra.models.ModelService#listModels}.
             * @memberof ultra.models.ModelService
             * @typedef ListModelsCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.models.ModelList} [response] ModelList
             */

            /**
             * Calls ListModels.
             * @function listModels
             * @memberof ultra.models.ModelService
             * @instance
             * @param {ultra.common.IEmpty} request Empty message or plain object
             * @param {ultra.models.ModelService.ListModelsCallback} callback Node-style callback called with the error, if any, and ModelList
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(ModelService.prototype.listModels = function listModels(request, callback) {
                return this.rpcCall(listModels, $root.ultra.common.Empty, $root.ultra.models.ModelList, request, callback);
            }, "name", { value: "ListModels" });

            /**
             * Calls ListModels.
             * @function listModels
             * @memberof ultra.models.ModelService
             * @instance
             * @param {ultra.common.IEmpty} request Empty message or plain object
             * @returns {Promise<ultra.models.ModelList>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link ultra.models.ModelService#getModel}.
             * @memberof ultra.models.ModelService
             * @typedef GetModelCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.models.Model} [response] Model
             */

            /**
             * Calls GetModel.
             * @function getModel
             * @memberof ultra.models.ModelService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @param {ultra.models.ModelService.GetModelCallback} callback Node-style callback called with the error, if any, and Model
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(ModelService.prototype.getModel = function getModel(request, callback) {
                return this.rpcCall(getModel, $root.ultra.common.IdRequest, $root.ultra.models.Model, request, callback);
            }, "name", { value: "GetModel" });

            /**
             * Calls GetModel.
             * @function getModel
             * @memberof ultra.models.ModelService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @returns {Promise<ultra.models.Model>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link ultra.models.ModelService#createModel}.
             * @memberof ultra.models.ModelService
             * @typedef CreateModelCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.models.Model} [response] Model
             */

            /**
             * Calls CreateModel.
             * @function createModel
             * @memberof ultra.models.ModelService
             * @instance
             * @param {ultra.models.ICreateModelRequest} request CreateModelRequest message or plain object
             * @param {ultra.models.ModelService.CreateModelCallback} callback Node-style callback called with the error, if any, and Model
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(ModelService.prototype.createModel = function createModel(request, callback) {
                return this.rpcCall(createModel, $root.ultra.models.CreateModelRequest, $root.ultra.models.Model, request, callback);
            }, "name", { value: "CreateModel" });

            /**
             * Calls CreateModel.
             * @function createModel
             * @memberof ultra.models.ModelService
             * @instance
             * @param {ultra.models.ICreateModelRequest} request CreateModelRequest message or plain object
             * @returns {Promise<ultra.models.Model>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link ultra.models.ModelService#deleteModel}.
             * @memberof ultra.models.ModelService
             * @typedef DeleteModelCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.common.DeleteResponse} [response] DeleteResponse
             */

            /**
             * Calls DeleteModel.
             * @function deleteModel
             * @memberof ultra.models.ModelService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @param {ultra.models.ModelService.DeleteModelCallback} callback Node-style callback called with the error, if any, and DeleteResponse
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(ModelService.prototype.deleteModel = function deleteModel(request, callback) {
                return this.rpcCall(deleteModel, $root.ultra.common.IdRequest, $root.ultra.common.DeleteResponse, request, callback);
            }, "name", { value: "DeleteModel" });

            /**
             * Calls DeleteModel.
             * @function deleteModel
             * @memberof ultra.models.ModelService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @returns {Promise<ultra.common.DeleteResponse>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link ultra.models.ModelService#testModel}.
             * @memberof ultra.models.ModelService
             * @typedef TestModelCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.models.TestModelResponse} [response] TestModelResponse
             */

            /**
             * Calls TestModel.
             * @function testModel
             * @memberof ultra.models.ModelService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @param {ultra.models.ModelService.TestModelCallback} callback Node-style callback called with the error, if any, and TestModelResponse
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(ModelService.prototype.testModel = function testModel(request, callback) {
                return this.rpcCall(testModel, $root.ultra.common.IdRequest, $root.ultra.models.TestModelResponse, request, callback);
            }, "name", { value: "TestModel" });

            /**
             * Calls TestModel.
             * @function testModel
             * @memberof ultra.models.ModelService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @returns {Promise<ultra.models.TestModelResponse>} Promise
             * @variation 2
             */

            return ModelService;
        })();

        return models;
    })();

    ultra.knowledge = (function() {

        /**
         * Namespace knowledge.
         * @memberof ultra
         * @namespace
         */
        const knowledge = {};

        knowledge.KnowledgeEntry = (function() {

            /**
             * Properties of a KnowledgeEntry.
             * @memberof ultra.knowledge
             * @interface IKnowledgeEntry
             * @property {string|null} [id] KnowledgeEntry id
             * @property {string|null} [name] KnowledgeEntry name
             * @property {string|null} [description] KnowledgeEntry description
             * @property {string|null} [content] KnowledgeEntry content
             * @property {string|null} [summary] KnowledgeEntry summary
             * @property {string|null} [contentType] KnowledgeEntry contentType
             * @property {string|null} [category] KnowledgeEntry category
             * @property {string|null} [tags] KnowledgeEntry tags
             * @property {number|null} [sizeBytes] KnowledgeEntry sizeBytes
             * @property {number|null} [tokenEstimate] KnowledgeEntry tokenEstimate
             * @property {boolean|null} [enabled] KnowledgeEntry enabled
             * @property {number|null} [priority] KnowledgeEntry priority
             * @property {string|null} [tierPolicy] KnowledgeEntry tierPolicy
             * @property {number|Long|null} [createdAt] KnowledgeEntry createdAt
             * @property {number|Long|null} [updatedAt] KnowledgeEntry updatedAt
             */

            /**
             * Constructs a new KnowledgeEntry.
             * @memberof ultra.knowledge
             * @classdesc Represents a KnowledgeEntry.
             * @implements IKnowledgeEntry
             * @constructor
             * @param {ultra.knowledge.IKnowledgeEntry=} [properties] Properties to set
             */
            function KnowledgeEntry(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * KnowledgeEntry id.
             * @member {string} id
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             */
            KnowledgeEntry.prototype.id = "";

            /**
             * KnowledgeEntry name.
             * @member {string} name
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             */
            KnowledgeEntry.prototype.name = "";

            /**
             * KnowledgeEntry description.
             * @member {string} description
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             */
            KnowledgeEntry.prototype.description = "";

            /**
             * KnowledgeEntry content.
             * @member {string} content
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             */
            KnowledgeEntry.prototype.content = "";

            /**
             * KnowledgeEntry summary.
             * @member {string} summary
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             */
            KnowledgeEntry.prototype.summary = "";

            /**
             * KnowledgeEntry contentType.
             * @member {string} contentType
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             */
            KnowledgeEntry.prototype.contentType = "";

            /**
             * KnowledgeEntry category.
             * @member {string} category
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             */
            KnowledgeEntry.prototype.category = "";

            /**
             * KnowledgeEntry tags.
             * @member {string} tags
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             */
            KnowledgeEntry.prototype.tags = "";

            /**
             * KnowledgeEntry sizeBytes.
             * @member {number} sizeBytes
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             */
            KnowledgeEntry.prototype.sizeBytes = 0;

            /**
             * KnowledgeEntry tokenEstimate.
             * @member {number} tokenEstimate
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             */
            KnowledgeEntry.prototype.tokenEstimate = 0;

            /**
             * KnowledgeEntry enabled.
             * @member {boolean} enabled
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             */
            KnowledgeEntry.prototype.enabled = false;

            /**
             * KnowledgeEntry priority.
             * @member {number} priority
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             */
            KnowledgeEntry.prototype.priority = 0;

            /**
             * KnowledgeEntry tierPolicy.
             * @member {string} tierPolicy
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             */
            KnowledgeEntry.prototype.tierPolicy = "";

            /**
             * KnowledgeEntry createdAt.
             * @member {number|Long} createdAt
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             */
            KnowledgeEntry.prototype.createdAt = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * KnowledgeEntry updatedAt.
             * @member {number|Long} updatedAt
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             */
            KnowledgeEntry.prototype.updatedAt = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * Creates a new KnowledgeEntry instance using the specified properties.
             * @function create
             * @memberof ultra.knowledge.KnowledgeEntry
             * @static
             * @param {ultra.knowledge.IKnowledgeEntry=} [properties] Properties to set
             * @returns {ultra.knowledge.KnowledgeEntry} KnowledgeEntry instance
             */
            KnowledgeEntry.create = function create(properties) {
                return new KnowledgeEntry(properties);
            };

            /**
             * Encodes the specified KnowledgeEntry message. Does not implicitly {@link ultra.knowledge.KnowledgeEntry.verify|verify} messages.
             * @function encode
             * @memberof ultra.knowledge.KnowledgeEntry
             * @static
             * @param {ultra.knowledge.IKnowledgeEntry} message KnowledgeEntry message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            KnowledgeEntry.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
                if (message.name != null && Object.hasOwnProperty.call(message, "name"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.name);
                if (message.description != null && Object.hasOwnProperty.call(message, "description"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.description);
                if (message.content != null && Object.hasOwnProperty.call(message, "content"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.content);
                if (message.summary != null && Object.hasOwnProperty.call(message, "summary"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.summary);
                if (message.contentType != null && Object.hasOwnProperty.call(message, "contentType"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.contentType);
                if (message.category != null && Object.hasOwnProperty.call(message, "category"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.category);
                if (message.tags != null && Object.hasOwnProperty.call(message, "tags"))
                    writer.uint32(/* id 8, wireType 2 =*/66).string(message.tags);
                if (message.sizeBytes != null && Object.hasOwnProperty.call(message, "sizeBytes"))
                    writer.uint32(/* id 9, wireType 0 =*/72).int32(message.sizeBytes);
                if (message.tokenEstimate != null && Object.hasOwnProperty.call(message, "tokenEstimate"))
                    writer.uint32(/* id 10, wireType 0 =*/80).int32(message.tokenEstimate);
                if (message.enabled != null && Object.hasOwnProperty.call(message, "enabled"))
                    writer.uint32(/* id 11, wireType 0 =*/88).bool(message.enabled);
                if (message.priority != null && Object.hasOwnProperty.call(message, "priority"))
                    writer.uint32(/* id 12, wireType 0 =*/96).int32(message.priority);
                if (message.tierPolicy != null && Object.hasOwnProperty.call(message, "tierPolicy"))
                    writer.uint32(/* id 13, wireType 2 =*/106).string(message.tierPolicy);
                if (message.createdAt != null && Object.hasOwnProperty.call(message, "createdAt"))
                    writer.uint32(/* id 14, wireType 0 =*/112).int64(message.createdAt);
                if (message.updatedAt != null && Object.hasOwnProperty.call(message, "updatedAt"))
                    writer.uint32(/* id 15, wireType 0 =*/120).int64(message.updatedAt);
                return writer;
            };

            /**
             * Encodes the specified KnowledgeEntry message, length delimited. Does not implicitly {@link ultra.knowledge.KnowledgeEntry.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.knowledge.KnowledgeEntry
             * @static
             * @param {ultra.knowledge.IKnowledgeEntry} message KnowledgeEntry message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            KnowledgeEntry.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a KnowledgeEntry message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.knowledge.KnowledgeEntry
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.knowledge.KnowledgeEntry} KnowledgeEntry
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            KnowledgeEntry.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.knowledge.KnowledgeEntry();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.id = reader.string();
                            break;
                        }
                    case 2: {
                            message.name = reader.string();
                            break;
                        }
                    case 3: {
                            message.description = reader.string();
                            break;
                        }
                    case 4: {
                            message.content = reader.string();
                            break;
                        }
                    case 5: {
                            message.summary = reader.string();
                            break;
                        }
                    case 6: {
                            message.contentType = reader.string();
                            break;
                        }
                    case 7: {
                            message.category = reader.string();
                            break;
                        }
                    case 8: {
                            message.tags = reader.string();
                            break;
                        }
                    case 9: {
                            message.sizeBytes = reader.int32();
                            break;
                        }
                    case 10: {
                            message.tokenEstimate = reader.int32();
                            break;
                        }
                    case 11: {
                            message.enabled = reader.bool();
                            break;
                        }
                    case 12: {
                            message.priority = reader.int32();
                            break;
                        }
                    case 13: {
                            message.tierPolicy = reader.string();
                            break;
                        }
                    case 14: {
                            message.createdAt = reader.int64();
                            break;
                        }
                    case 15: {
                            message.updatedAt = reader.int64();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a KnowledgeEntry message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.knowledge.KnowledgeEntry
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.knowledge.KnowledgeEntry} KnowledgeEntry
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            KnowledgeEntry.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a KnowledgeEntry message.
             * @function verify
             * @memberof ultra.knowledge.KnowledgeEntry
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            KnowledgeEntry.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.id != null && message.hasOwnProperty("id"))
                    if (!$util.isString(message.id))
                        return "id: string expected";
                if (message.name != null && message.hasOwnProperty("name"))
                    if (!$util.isString(message.name))
                        return "name: string expected";
                if (message.description != null && message.hasOwnProperty("description"))
                    if (!$util.isString(message.description))
                        return "description: string expected";
                if (message.content != null && message.hasOwnProperty("content"))
                    if (!$util.isString(message.content))
                        return "content: string expected";
                if (message.summary != null && message.hasOwnProperty("summary"))
                    if (!$util.isString(message.summary))
                        return "summary: string expected";
                if (message.contentType != null && message.hasOwnProperty("contentType"))
                    if (!$util.isString(message.contentType))
                        return "contentType: string expected";
                if (message.category != null && message.hasOwnProperty("category"))
                    if (!$util.isString(message.category))
                        return "category: string expected";
                if (message.tags != null && message.hasOwnProperty("tags"))
                    if (!$util.isString(message.tags))
                        return "tags: string expected";
                if (message.sizeBytes != null && message.hasOwnProperty("sizeBytes"))
                    if (!$util.isInteger(message.sizeBytes))
                        return "sizeBytes: integer expected";
                if (message.tokenEstimate != null && message.hasOwnProperty("tokenEstimate"))
                    if (!$util.isInteger(message.tokenEstimate))
                        return "tokenEstimate: integer expected";
                if (message.enabled != null && message.hasOwnProperty("enabled"))
                    if (typeof message.enabled !== "boolean")
                        return "enabled: boolean expected";
                if (message.priority != null && message.hasOwnProperty("priority"))
                    if (!$util.isInteger(message.priority))
                        return "priority: integer expected";
                if (message.tierPolicy != null && message.hasOwnProperty("tierPolicy"))
                    if (!$util.isString(message.tierPolicy))
                        return "tierPolicy: string expected";
                if (message.createdAt != null && message.hasOwnProperty("createdAt"))
                    if (!$util.isInteger(message.createdAt) && !(message.createdAt && $util.isInteger(message.createdAt.low) && $util.isInteger(message.createdAt.high)))
                        return "createdAt: integer|Long expected";
                if (message.updatedAt != null && message.hasOwnProperty("updatedAt"))
                    if (!$util.isInteger(message.updatedAt) && !(message.updatedAt && $util.isInteger(message.updatedAt.low) && $util.isInteger(message.updatedAt.high)))
                        return "updatedAt: integer|Long expected";
                return null;
            };

            /**
             * Creates a KnowledgeEntry message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.knowledge.KnowledgeEntry
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.knowledge.KnowledgeEntry} KnowledgeEntry
             */
            KnowledgeEntry.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.knowledge.KnowledgeEntry)
                    return object;
                let message = new $root.ultra.knowledge.KnowledgeEntry();
                if (object.id != null)
                    message.id = String(object.id);
                if (object.name != null)
                    message.name = String(object.name);
                if (object.description != null)
                    message.description = String(object.description);
                if (object.content != null)
                    message.content = String(object.content);
                if (object.summary != null)
                    message.summary = String(object.summary);
                if (object.contentType != null)
                    message.contentType = String(object.contentType);
                if (object.category != null)
                    message.category = String(object.category);
                if (object.tags != null)
                    message.tags = String(object.tags);
                if (object.sizeBytes != null)
                    message.sizeBytes = object.sizeBytes | 0;
                if (object.tokenEstimate != null)
                    message.tokenEstimate = object.tokenEstimate | 0;
                if (object.enabled != null)
                    message.enabled = Boolean(object.enabled);
                if (object.priority != null)
                    message.priority = object.priority | 0;
                if (object.tierPolicy != null)
                    message.tierPolicy = String(object.tierPolicy);
                if (object.createdAt != null)
                    if ($util.Long)
                        (message.createdAt = $util.Long.fromValue(object.createdAt)).unsigned = false;
                    else if (typeof object.createdAt === "string")
                        message.createdAt = parseInt(object.createdAt, 10);
                    else if (typeof object.createdAt === "number")
                        message.createdAt = object.createdAt;
                    else if (typeof object.createdAt === "object")
                        message.createdAt = new $util.LongBits(object.createdAt.low >>> 0, object.createdAt.high >>> 0).toNumber();
                if (object.updatedAt != null)
                    if ($util.Long)
                        (message.updatedAt = $util.Long.fromValue(object.updatedAt)).unsigned = false;
                    else if (typeof object.updatedAt === "string")
                        message.updatedAt = parseInt(object.updatedAt, 10);
                    else if (typeof object.updatedAt === "number")
                        message.updatedAt = object.updatedAt;
                    else if (typeof object.updatedAt === "object")
                        message.updatedAt = new $util.LongBits(object.updatedAt.low >>> 0, object.updatedAt.high >>> 0).toNumber();
                return message;
            };

            /**
             * Creates a plain object from a KnowledgeEntry message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.knowledge.KnowledgeEntry
             * @static
             * @param {ultra.knowledge.KnowledgeEntry} message KnowledgeEntry
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            KnowledgeEntry.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.defaults) {
                    object.id = "";
                    object.name = "";
                    object.description = "";
                    object.content = "";
                    object.summary = "";
                    object.contentType = "";
                    object.category = "";
                    object.tags = "";
                    object.sizeBytes = 0;
                    object.tokenEstimate = 0;
                    object.enabled = false;
                    object.priority = 0;
                    object.tierPolicy = "";
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.createdAt = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.createdAt = options.longs === String ? "0" : 0;
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.updatedAt = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.updatedAt = options.longs === String ? "0" : 0;
                }
                if (message.id != null && message.hasOwnProperty("id"))
                    object.id = message.id;
                if (message.name != null && message.hasOwnProperty("name"))
                    object.name = message.name;
                if (message.description != null && message.hasOwnProperty("description"))
                    object.description = message.description;
                if (message.content != null && message.hasOwnProperty("content"))
                    object.content = message.content;
                if (message.summary != null && message.hasOwnProperty("summary"))
                    object.summary = message.summary;
                if (message.contentType != null && message.hasOwnProperty("contentType"))
                    object.contentType = message.contentType;
                if (message.category != null && message.hasOwnProperty("category"))
                    object.category = message.category;
                if (message.tags != null && message.hasOwnProperty("tags"))
                    object.tags = message.tags;
                if (message.sizeBytes != null && message.hasOwnProperty("sizeBytes"))
                    object.sizeBytes = message.sizeBytes;
                if (message.tokenEstimate != null && message.hasOwnProperty("tokenEstimate"))
                    object.tokenEstimate = message.tokenEstimate;
                if (message.enabled != null && message.hasOwnProperty("enabled"))
                    object.enabled = message.enabled;
                if (message.priority != null && message.hasOwnProperty("priority"))
                    object.priority = message.priority;
                if (message.tierPolicy != null && message.hasOwnProperty("tierPolicy"))
                    object.tierPolicy = message.tierPolicy;
                if (message.createdAt != null && message.hasOwnProperty("createdAt"))
                    if (typeof message.createdAt === "number")
                        object.createdAt = options.longs === String ? String(message.createdAt) : message.createdAt;
                    else
                        object.createdAt = options.longs === String ? $util.Long.prototype.toString.call(message.createdAt) : options.longs === Number ? new $util.LongBits(message.createdAt.low >>> 0, message.createdAt.high >>> 0).toNumber() : message.createdAt;
                if (message.updatedAt != null && message.hasOwnProperty("updatedAt"))
                    if (typeof message.updatedAt === "number")
                        object.updatedAt = options.longs === String ? String(message.updatedAt) : message.updatedAt;
                    else
                        object.updatedAt = options.longs === String ? $util.Long.prototype.toString.call(message.updatedAt) : options.longs === Number ? new $util.LongBits(message.updatedAt.low >>> 0, message.updatedAt.high >>> 0).toNumber() : message.updatedAt;
                return object;
            };

            /**
             * Converts this KnowledgeEntry to JSON.
             * @function toJSON
             * @memberof ultra.knowledge.KnowledgeEntry
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            KnowledgeEntry.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for KnowledgeEntry
             * @function getTypeUrl
             * @memberof ultra.knowledge.KnowledgeEntry
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            KnowledgeEntry.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.knowledge.KnowledgeEntry";
            };

            return KnowledgeEntry;
        })();

        knowledge.KnowledgeList = (function() {

            /**
             * Properties of a KnowledgeList.
             * @memberof ultra.knowledge
             * @interface IKnowledgeList
             * @property {Array.<ultra.knowledge.IKnowledgeEntry>|null} [entries] KnowledgeList entries
             */

            /**
             * Constructs a new KnowledgeList.
             * @memberof ultra.knowledge
             * @classdesc Represents a KnowledgeList.
             * @implements IKnowledgeList
             * @constructor
             * @param {ultra.knowledge.IKnowledgeList=} [properties] Properties to set
             */
            function KnowledgeList(properties) {
                this.entries = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * KnowledgeList entries.
             * @member {Array.<ultra.knowledge.IKnowledgeEntry>} entries
             * @memberof ultra.knowledge.KnowledgeList
             * @instance
             */
            KnowledgeList.prototype.entries = $util.emptyArray;

            /**
             * Creates a new KnowledgeList instance using the specified properties.
             * @function create
             * @memberof ultra.knowledge.KnowledgeList
             * @static
             * @param {ultra.knowledge.IKnowledgeList=} [properties] Properties to set
             * @returns {ultra.knowledge.KnowledgeList} KnowledgeList instance
             */
            KnowledgeList.create = function create(properties) {
                return new KnowledgeList(properties);
            };

            /**
             * Encodes the specified KnowledgeList message. Does not implicitly {@link ultra.knowledge.KnowledgeList.verify|verify} messages.
             * @function encode
             * @memberof ultra.knowledge.KnowledgeList
             * @static
             * @param {ultra.knowledge.IKnowledgeList} message KnowledgeList message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            KnowledgeList.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.entries != null && message.entries.length)
                    for (let i = 0; i < message.entries.length; ++i)
                        $root.ultra.knowledge.KnowledgeEntry.encode(message.entries[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                return writer;
            };

            /**
             * Encodes the specified KnowledgeList message, length delimited. Does not implicitly {@link ultra.knowledge.KnowledgeList.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.knowledge.KnowledgeList
             * @static
             * @param {ultra.knowledge.IKnowledgeList} message KnowledgeList message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            KnowledgeList.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a KnowledgeList message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.knowledge.KnowledgeList
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.knowledge.KnowledgeList} KnowledgeList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            KnowledgeList.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.knowledge.KnowledgeList();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            if (!(message.entries && message.entries.length))
                                message.entries = [];
                            message.entries.push($root.ultra.knowledge.KnowledgeEntry.decode(reader, reader.uint32()));
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a KnowledgeList message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.knowledge.KnowledgeList
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.knowledge.KnowledgeList} KnowledgeList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            KnowledgeList.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a KnowledgeList message.
             * @function verify
             * @memberof ultra.knowledge.KnowledgeList
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            KnowledgeList.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.entries != null && message.hasOwnProperty("entries")) {
                    if (!Array.isArray(message.entries))
                        return "entries: array expected";
                    for (let i = 0; i < message.entries.length; ++i) {
                        let error = $root.ultra.knowledge.KnowledgeEntry.verify(message.entries[i]);
                        if (error)
                            return "entries." + error;
                    }
                }
                return null;
            };

            /**
             * Creates a KnowledgeList message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.knowledge.KnowledgeList
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.knowledge.KnowledgeList} KnowledgeList
             */
            KnowledgeList.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.knowledge.KnowledgeList)
                    return object;
                let message = new $root.ultra.knowledge.KnowledgeList();
                if (object.entries) {
                    if (!Array.isArray(object.entries))
                        throw TypeError(".ultra.knowledge.KnowledgeList.entries: array expected");
                    message.entries = [];
                    for (let i = 0; i < object.entries.length; ++i) {
                        if (typeof object.entries[i] !== "object")
                            throw TypeError(".ultra.knowledge.KnowledgeList.entries: object expected");
                        message.entries[i] = $root.ultra.knowledge.KnowledgeEntry.fromObject(object.entries[i]);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from a KnowledgeList message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.knowledge.KnowledgeList
             * @static
             * @param {ultra.knowledge.KnowledgeList} message KnowledgeList
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            KnowledgeList.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.arrays || options.defaults)
                    object.entries = [];
                if (message.entries && message.entries.length) {
                    object.entries = [];
                    for (let j = 0; j < message.entries.length; ++j)
                        object.entries[j] = $root.ultra.knowledge.KnowledgeEntry.toObject(message.entries[j], options);
                }
                return object;
            };

            /**
             * Converts this KnowledgeList to JSON.
             * @function toJSON
             * @memberof ultra.knowledge.KnowledgeList
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            KnowledgeList.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for KnowledgeList
             * @function getTypeUrl
             * @memberof ultra.knowledge.KnowledgeList
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            KnowledgeList.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.knowledge.KnowledgeList";
            };

            return KnowledgeList;
        })();

        knowledge.SearchKnowledgeRequest = (function() {

            /**
             * Properties of a SearchKnowledgeRequest.
             * @memberof ultra.knowledge
             * @interface ISearchKnowledgeRequest
             * @property {string|null} [query] SearchKnowledgeRequest query
             * @property {number|null} [limit] SearchKnowledgeRequest limit
             */

            /**
             * Constructs a new SearchKnowledgeRequest.
             * @memberof ultra.knowledge
             * @classdesc Represents a SearchKnowledgeRequest.
             * @implements ISearchKnowledgeRequest
             * @constructor
             * @param {ultra.knowledge.ISearchKnowledgeRequest=} [properties] Properties to set
             */
            function SearchKnowledgeRequest(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * SearchKnowledgeRequest query.
             * @member {string} query
             * @memberof ultra.knowledge.SearchKnowledgeRequest
             * @instance
             */
            SearchKnowledgeRequest.prototype.query = "";

            /**
             * SearchKnowledgeRequest limit.
             * @member {number} limit
             * @memberof ultra.knowledge.SearchKnowledgeRequest
             * @instance
             */
            SearchKnowledgeRequest.prototype.limit = 0;

            /**
             * Creates a new SearchKnowledgeRequest instance using the specified properties.
             * @function create
             * @memberof ultra.knowledge.SearchKnowledgeRequest
             * @static
             * @param {ultra.knowledge.ISearchKnowledgeRequest=} [properties] Properties to set
             * @returns {ultra.knowledge.SearchKnowledgeRequest} SearchKnowledgeRequest instance
             */
            SearchKnowledgeRequest.create = function create(properties) {
                return new SearchKnowledgeRequest(properties);
            };

            /**
             * Encodes the specified SearchKnowledgeRequest message. Does not implicitly {@link ultra.knowledge.SearchKnowledgeRequest.verify|verify} messages.
             * @function encode
             * @memberof ultra.knowledge.SearchKnowledgeRequest
             * @static
             * @param {ultra.knowledge.ISearchKnowledgeRequest} message SearchKnowledgeRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SearchKnowledgeRequest.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.query != null && Object.hasOwnProperty.call(message, "query"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.query);
                if (message.limit != null && Object.hasOwnProperty.call(message, "limit"))
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.limit);
                return writer;
            };

            /**
             * Encodes the specified SearchKnowledgeRequest message, length delimited. Does not implicitly {@link ultra.knowledge.SearchKnowledgeRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.knowledge.SearchKnowledgeRequest
             * @static
             * @param {ultra.knowledge.ISearchKnowledgeRequest} message SearchKnowledgeRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SearchKnowledgeRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a SearchKnowledgeRequest message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.knowledge.SearchKnowledgeRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.knowledge.SearchKnowledgeRequest} SearchKnowledgeRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SearchKnowledgeRequest.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.knowledge.SearchKnowledgeRequest();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.query = reader.string();
                            break;
                        }
                    case 2: {
                            message.limit = reader.int32();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a SearchKnowledgeRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.knowledge.SearchKnowledgeRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.knowledge.SearchKnowledgeRequest} SearchKnowledgeRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SearchKnowledgeRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a SearchKnowledgeRequest message.
             * @function verify
             * @memberof ultra.knowledge.SearchKnowledgeRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            SearchKnowledgeRequest.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.query != null && message.hasOwnProperty("query"))
                    if (!$util.isString(message.query))
                        return "query: string expected";
                if (message.limit != null && message.hasOwnProperty("limit"))
                    if (!$util.isInteger(message.limit))
                        return "limit: integer expected";
                return null;
            };

            /**
             * Creates a SearchKnowledgeRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.knowledge.SearchKnowledgeRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.knowledge.SearchKnowledgeRequest} SearchKnowledgeRequest
             */
            SearchKnowledgeRequest.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.knowledge.SearchKnowledgeRequest)
                    return object;
                let message = new $root.ultra.knowledge.SearchKnowledgeRequest();
                if (object.query != null)
                    message.query = String(object.query);
                if (object.limit != null)
                    message.limit = object.limit | 0;
                return message;
            };

            /**
             * Creates a plain object from a SearchKnowledgeRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.knowledge.SearchKnowledgeRequest
             * @static
             * @param {ultra.knowledge.SearchKnowledgeRequest} message SearchKnowledgeRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            SearchKnowledgeRequest.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.defaults) {
                    object.query = "";
                    object.limit = 0;
                }
                if (message.query != null && message.hasOwnProperty("query"))
                    object.query = message.query;
                if (message.limit != null && message.hasOwnProperty("limit"))
                    object.limit = message.limit;
                return object;
            };

            /**
             * Converts this SearchKnowledgeRequest to JSON.
             * @function toJSON
             * @memberof ultra.knowledge.SearchKnowledgeRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            SearchKnowledgeRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for SearchKnowledgeRequest
             * @function getTypeUrl
             * @memberof ultra.knowledge.SearchKnowledgeRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            SearchKnowledgeRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.knowledge.SearchKnowledgeRequest";
            };

            return SearchKnowledgeRequest;
        })();

        knowledge.CreateKnowledgeRequest = (function() {

            /**
             * Properties of a CreateKnowledgeRequest.
             * @memberof ultra.knowledge
             * @interface ICreateKnowledgeRequest
             * @property {string|null} [name] CreateKnowledgeRequest name
             * @property {string|null} [description] CreateKnowledgeRequest description
             * @property {string|null} [content] CreateKnowledgeRequest content
             * @property {string|null} [contentType] CreateKnowledgeRequest contentType
             * @property {string|null} [category] CreateKnowledgeRequest category
             * @property {string|null} [tags] CreateKnowledgeRequest tags
             * @property {number|null} [priority] CreateKnowledgeRequest priority
             * @property {string|null} [tierPolicy] CreateKnowledgeRequest tierPolicy
             */

            /**
             * Constructs a new CreateKnowledgeRequest.
             * @memberof ultra.knowledge
             * @classdesc Represents a CreateKnowledgeRequest.
             * @implements ICreateKnowledgeRequest
             * @constructor
             * @param {ultra.knowledge.ICreateKnowledgeRequest=} [properties] Properties to set
             */
            function CreateKnowledgeRequest(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * CreateKnowledgeRequest name.
             * @member {string} name
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @instance
             */
            CreateKnowledgeRequest.prototype.name = "";

            /**
             * CreateKnowledgeRequest description.
             * @member {string} description
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @instance
             */
            CreateKnowledgeRequest.prototype.description = "";

            /**
             * CreateKnowledgeRequest content.
             * @member {string} content
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @instance
             */
            CreateKnowledgeRequest.prototype.content = "";

            /**
             * CreateKnowledgeRequest contentType.
             * @member {string} contentType
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @instance
             */
            CreateKnowledgeRequest.prototype.contentType = "";

            /**
             * CreateKnowledgeRequest category.
             * @member {string} category
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @instance
             */
            CreateKnowledgeRequest.prototype.category = "";

            /**
             * CreateKnowledgeRequest tags.
             * @member {string} tags
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @instance
             */
            CreateKnowledgeRequest.prototype.tags = "";

            /**
             * CreateKnowledgeRequest priority.
             * @member {number} priority
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @instance
             */
            CreateKnowledgeRequest.prototype.priority = 0;

            /**
             * CreateKnowledgeRequest tierPolicy.
             * @member {string} tierPolicy
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @instance
             */
            CreateKnowledgeRequest.prototype.tierPolicy = "";

            /**
             * Creates a new CreateKnowledgeRequest instance using the specified properties.
             * @function create
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @static
             * @param {ultra.knowledge.ICreateKnowledgeRequest=} [properties] Properties to set
             * @returns {ultra.knowledge.CreateKnowledgeRequest} CreateKnowledgeRequest instance
             */
            CreateKnowledgeRequest.create = function create(properties) {
                return new CreateKnowledgeRequest(properties);
            };

            /**
             * Encodes the specified CreateKnowledgeRequest message. Does not implicitly {@link ultra.knowledge.CreateKnowledgeRequest.verify|verify} messages.
             * @function encode
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @static
             * @param {ultra.knowledge.ICreateKnowledgeRequest} message CreateKnowledgeRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CreateKnowledgeRequest.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.name != null && Object.hasOwnProperty.call(message, "name"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.name);
                if (message.description != null && Object.hasOwnProperty.call(message, "description"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.description);
                if (message.content != null && Object.hasOwnProperty.call(message, "content"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.content);
                if (message.contentType != null && Object.hasOwnProperty.call(message, "contentType"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.contentType);
                if (message.category != null && Object.hasOwnProperty.call(message, "category"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.category);
                if (message.tags != null && Object.hasOwnProperty.call(message, "tags"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.tags);
                if (message.priority != null && Object.hasOwnProperty.call(message, "priority"))
                    writer.uint32(/* id 7, wireType 0 =*/56).int32(message.priority);
                if (message.tierPolicy != null && Object.hasOwnProperty.call(message, "tierPolicy"))
                    writer.uint32(/* id 8, wireType 2 =*/66).string(message.tierPolicy);
                return writer;
            };

            /**
             * Encodes the specified CreateKnowledgeRequest message, length delimited. Does not implicitly {@link ultra.knowledge.CreateKnowledgeRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @static
             * @param {ultra.knowledge.ICreateKnowledgeRequest} message CreateKnowledgeRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CreateKnowledgeRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a CreateKnowledgeRequest message from the specified reader or buffer.
             * @function decode
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {ultra.knowledge.CreateKnowledgeRequest} CreateKnowledgeRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CreateKnowledgeRequest.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.ultra.knowledge.CreateKnowledgeRequest();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.name = reader.string();
                            break;
                        }
                    case 2: {
                            message.description = reader.string();
                            break;
                        }
                    case 3: {
                            message.content = reader.string();
                            break;
                        }
                    case 4: {
                            message.contentType = reader.string();
                            break;
                        }
                    case 5: {
                            message.category = reader.string();
                            break;
                        }
                    case 6: {
                            message.tags = reader.string();
                            break;
                        }
                    case 7: {
                            message.priority = reader.int32();
                            break;
                        }
                    case 8: {
                            message.tierPolicy = reader.string();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a CreateKnowledgeRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {ultra.knowledge.CreateKnowledgeRequest} CreateKnowledgeRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CreateKnowledgeRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a CreateKnowledgeRequest message.
             * @function verify
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            CreateKnowledgeRequest.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.name != null && message.hasOwnProperty("name"))
                    if (!$util.isString(message.name))
                        return "name: string expected";
                if (message.description != null && message.hasOwnProperty("description"))
                    if (!$util.isString(message.description))
                        return "description: string expected";
                if (message.content != null && message.hasOwnProperty("content"))
                    if (!$util.isString(message.content))
                        return "content: string expected";
                if (message.contentType != null && message.hasOwnProperty("contentType"))
                    if (!$util.isString(message.contentType))
                        return "contentType: string expected";
                if (message.category != null && message.hasOwnProperty("category"))
                    if (!$util.isString(message.category))
                        return "category: string expected";
                if (message.tags != null && message.hasOwnProperty("tags"))
                    if (!$util.isString(message.tags))
                        return "tags: string expected";
                if (message.priority != null && message.hasOwnProperty("priority"))
                    if (!$util.isInteger(message.priority))
                        return "priority: integer expected";
                if (message.tierPolicy != null && message.hasOwnProperty("tierPolicy"))
                    if (!$util.isString(message.tierPolicy))
                        return "tierPolicy: string expected";
                return null;
            };

            /**
             * Creates a CreateKnowledgeRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {ultra.knowledge.CreateKnowledgeRequest} CreateKnowledgeRequest
             */
            CreateKnowledgeRequest.fromObject = function fromObject(object) {
                if (object instanceof $root.ultra.knowledge.CreateKnowledgeRequest)
                    return object;
                let message = new $root.ultra.knowledge.CreateKnowledgeRequest();
                if (object.name != null)
                    message.name = String(object.name);
                if (object.description != null)
                    message.description = String(object.description);
                if (object.content != null)
                    message.content = String(object.content);
                if (object.contentType != null)
                    message.contentType = String(object.contentType);
                if (object.category != null)
                    message.category = String(object.category);
                if (object.tags != null)
                    message.tags = String(object.tags);
                if (object.priority != null)
                    message.priority = object.priority | 0;
                if (object.tierPolicy != null)
                    message.tierPolicy = String(object.tierPolicy);
                return message;
            };

            /**
             * Creates a plain object from a CreateKnowledgeRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @static
             * @param {ultra.knowledge.CreateKnowledgeRequest} message CreateKnowledgeRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            CreateKnowledgeRequest.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                let object = {};
                if (options.defaults) {
                    object.name = "";
                    object.description = "";
                    object.content = "";
                    object.contentType = "";
                    object.category = "";
                    object.tags = "";
                    object.priority = 0;
                    object.tierPolicy = "";
                }
                if (message.name != null && message.hasOwnProperty("name"))
                    object.name = message.name;
                if (message.description != null && message.hasOwnProperty("description"))
                    object.description = message.description;
                if (message.content != null && message.hasOwnProperty("content"))
                    object.content = message.content;
                if (message.contentType != null && message.hasOwnProperty("contentType"))
                    object.contentType = message.contentType;
                if (message.category != null && message.hasOwnProperty("category"))
                    object.category = message.category;
                if (message.tags != null && message.hasOwnProperty("tags"))
                    object.tags = message.tags;
                if (message.priority != null && message.hasOwnProperty("priority"))
                    object.priority = message.priority;
                if (message.tierPolicy != null && message.hasOwnProperty("tierPolicy"))
                    object.tierPolicy = message.tierPolicy;
                return object;
            };

            /**
             * Converts this CreateKnowledgeRequest to JSON.
             * @function toJSON
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            CreateKnowledgeRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for CreateKnowledgeRequest
             * @function getTypeUrl
             * @memberof ultra.knowledge.CreateKnowledgeRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            CreateKnowledgeRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/ultra.knowledge.CreateKnowledgeRequest";
            };

            return CreateKnowledgeRequest;
        })();

        knowledge.KnowledgeService = (function() {

            /**
             * Constructs a new KnowledgeService service.
             * @memberof ultra.knowledge
             * @classdesc Represents a KnowledgeService
             * @extends $protobuf.rpc.Service
             * @constructor
             * @param {$protobuf.RPCImpl} rpcImpl RPC implementation
             * @param {boolean} [requestDelimited=false] Whether requests are length-delimited
             * @param {boolean} [responseDelimited=false] Whether responses are length-delimited
             */
            function KnowledgeService(rpcImpl, requestDelimited, responseDelimited) {
                $protobuf.rpc.Service.call(this, rpcImpl, requestDelimited, responseDelimited);
            }

            (KnowledgeService.prototype = Object.create($protobuf.rpc.Service.prototype)).constructor = KnowledgeService;

            /**
             * Creates new KnowledgeService service using the specified rpc implementation.
             * @function create
             * @memberof ultra.knowledge.KnowledgeService
             * @static
             * @param {$protobuf.RPCImpl} rpcImpl RPC implementation
             * @param {boolean} [requestDelimited=false] Whether requests are length-delimited
             * @param {boolean} [responseDelimited=false] Whether responses are length-delimited
             * @returns {KnowledgeService} RPC service. Useful where requests and/or responses are streamed.
             */
            KnowledgeService.create = function create(rpcImpl, requestDelimited, responseDelimited) {
                return new this(rpcImpl, requestDelimited, responseDelimited);
            };

            /**
             * Callback as used by {@link ultra.knowledge.KnowledgeService#listKnowledge}.
             * @memberof ultra.knowledge.KnowledgeService
             * @typedef ListKnowledgeCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.knowledge.KnowledgeList} [response] KnowledgeList
             */

            /**
             * Calls ListKnowledge.
             * @function listKnowledge
             * @memberof ultra.knowledge.KnowledgeService
             * @instance
             * @param {ultra.common.IEmpty} request Empty message or plain object
             * @param {ultra.knowledge.KnowledgeService.ListKnowledgeCallback} callback Node-style callback called with the error, if any, and KnowledgeList
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(KnowledgeService.prototype.listKnowledge = function listKnowledge(request, callback) {
                return this.rpcCall(listKnowledge, $root.ultra.common.Empty, $root.ultra.knowledge.KnowledgeList, request, callback);
            }, "name", { value: "ListKnowledge" });

            /**
             * Calls ListKnowledge.
             * @function listKnowledge
             * @memberof ultra.knowledge.KnowledgeService
             * @instance
             * @param {ultra.common.IEmpty} request Empty message or plain object
             * @returns {Promise<ultra.knowledge.KnowledgeList>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link ultra.knowledge.KnowledgeService#getKnowledgeEntry}.
             * @memberof ultra.knowledge.KnowledgeService
             * @typedef GetKnowledgeEntryCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.knowledge.KnowledgeEntry} [response] KnowledgeEntry
             */

            /**
             * Calls GetKnowledgeEntry.
             * @function getKnowledgeEntry
             * @memberof ultra.knowledge.KnowledgeService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @param {ultra.knowledge.KnowledgeService.GetKnowledgeEntryCallback} callback Node-style callback called with the error, if any, and KnowledgeEntry
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(KnowledgeService.prototype.getKnowledgeEntry = function getKnowledgeEntry(request, callback) {
                return this.rpcCall(getKnowledgeEntry, $root.ultra.common.IdRequest, $root.ultra.knowledge.KnowledgeEntry, request, callback);
            }, "name", { value: "GetKnowledgeEntry" });

            /**
             * Calls GetKnowledgeEntry.
             * @function getKnowledgeEntry
             * @memberof ultra.knowledge.KnowledgeService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @returns {Promise<ultra.knowledge.KnowledgeEntry>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link ultra.knowledge.KnowledgeService#createKnowledgeEntry}.
             * @memberof ultra.knowledge.KnowledgeService
             * @typedef CreateKnowledgeEntryCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.knowledge.KnowledgeEntry} [response] KnowledgeEntry
             */

            /**
             * Calls CreateKnowledgeEntry.
             * @function createKnowledgeEntry
             * @memberof ultra.knowledge.KnowledgeService
             * @instance
             * @param {ultra.knowledge.ICreateKnowledgeRequest} request CreateKnowledgeRequest message or plain object
             * @param {ultra.knowledge.KnowledgeService.CreateKnowledgeEntryCallback} callback Node-style callback called with the error, if any, and KnowledgeEntry
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(KnowledgeService.prototype.createKnowledgeEntry = function createKnowledgeEntry(request, callback) {
                return this.rpcCall(createKnowledgeEntry, $root.ultra.knowledge.CreateKnowledgeRequest, $root.ultra.knowledge.KnowledgeEntry, request, callback);
            }, "name", { value: "CreateKnowledgeEntry" });

            /**
             * Calls CreateKnowledgeEntry.
             * @function createKnowledgeEntry
             * @memberof ultra.knowledge.KnowledgeService
             * @instance
             * @param {ultra.knowledge.ICreateKnowledgeRequest} request CreateKnowledgeRequest message or plain object
             * @returns {Promise<ultra.knowledge.KnowledgeEntry>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link ultra.knowledge.KnowledgeService#deleteKnowledgeEntry}.
             * @memberof ultra.knowledge.KnowledgeService
             * @typedef DeleteKnowledgeEntryCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.common.DeleteResponse} [response] DeleteResponse
             */

            /**
             * Calls DeleteKnowledgeEntry.
             * @function deleteKnowledgeEntry
             * @memberof ultra.knowledge.KnowledgeService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @param {ultra.knowledge.KnowledgeService.DeleteKnowledgeEntryCallback} callback Node-style callback called with the error, if any, and DeleteResponse
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(KnowledgeService.prototype.deleteKnowledgeEntry = function deleteKnowledgeEntry(request, callback) {
                return this.rpcCall(deleteKnowledgeEntry, $root.ultra.common.IdRequest, $root.ultra.common.DeleteResponse, request, callback);
            }, "name", { value: "DeleteKnowledgeEntry" });

            /**
             * Calls DeleteKnowledgeEntry.
             * @function deleteKnowledgeEntry
             * @memberof ultra.knowledge.KnowledgeService
             * @instance
             * @param {ultra.common.IIdRequest} request IdRequest message or plain object
             * @returns {Promise<ultra.common.DeleteResponse>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link ultra.knowledge.KnowledgeService#searchKnowledge}.
             * @memberof ultra.knowledge.KnowledgeService
             * @typedef SearchKnowledgeCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {ultra.knowledge.KnowledgeList} [response] KnowledgeList
             */

            /**
             * Calls SearchKnowledge.
             * @function searchKnowledge
             * @memberof ultra.knowledge.KnowledgeService
             * @instance
             * @param {ultra.knowledge.ISearchKnowledgeRequest} request SearchKnowledgeRequest message or plain object
             * @param {ultra.knowledge.KnowledgeService.SearchKnowledgeCallback} callback Node-style callback called with the error, if any, and KnowledgeList
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(KnowledgeService.prototype.searchKnowledge = function searchKnowledge(request, callback) {
                return this.rpcCall(searchKnowledge, $root.ultra.knowledge.SearchKnowledgeRequest, $root.ultra.knowledge.KnowledgeList, request, callback);
            }, "name", { value: "SearchKnowledge" });

            /**
             * Calls SearchKnowledge.
             * @function searchKnowledge
             * @memberof ultra.knowledge.KnowledgeService
             * @instance
             * @param {ultra.knowledge.ISearchKnowledgeRequest} request SearchKnowledgeRequest message or plain object
             * @returns {Promise<ultra.knowledge.KnowledgeList>} Promise
             * @variation 2
             */

            return KnowledgeService;
        })();

        return knowledge;
    })();

    return ultra;
})();

export { $root as default };
