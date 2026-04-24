import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace ultra. */
export namespace ultra {

    /** Namespace common. */
    namespace common {

        /** Properties of an Empty. */
        interface IEmpty {
        }

        /** Represents an Empty. */
        class Empty implements IEmpty {

            /**
             * Constructs a new Empty.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.common.IEmpty);

            /**
             * Creates a new Empty instance using the specified properties.
             * @param [properties] Properties to set
             * @returns Empty instance
             */
            public static create(properties?: ultra.common.IEmpty): ultra.common.Empty;

            /**
             * Encodes the specified Empty message. Does not implicitly {@link ultra.common.Empty.verify|verify} messages.
             * @param message Empty message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.common.IEmpty, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified Empty message, length delimited. Does not implicitly {@link ultra.common.Empty.verify|verify} messages.
             * @param message Empty message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.common.IEmpty, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an Empty message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns Empty
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.common.Empty;

            /**
             * Decodes an Empty message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns Empty
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.common.Empty;

            /**
             * Verifies an Empty message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates an Empty message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns Empty
             */
            public static fromObject(object: { [k: string]: any }): ultra.common.Empty;

            /**
             * Creates a plain object from an Empty message. Also converts values to other types if specified.
             * @param message Empty
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.common.Empty, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Empty to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for Empty
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of an IdRequest. */
        interface IIdRequest {

            /** IdRequest id */
            id?: (string|null);
        }

        /** Represents an IdRequest. */
        class IdRequest implements IIdRequest {

            /**
             * Constructs a new IdRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.common.IIdRequest);

            /** IdRequest id. */
            public id: string;

            /**
             * Creates a new IdRequest instance using the specified properties.
             * @param [properties] Properties to set
             * @returns IdRequest instance
             */
            public static create(properties?: ultra.common.IIdRequest): ultra.common.IdRequest;

            /**
             * Encodes the specified IdRequest message. Does not implicitly {@link ultra.common.IdRequest.verify|verify} messages.
             * @param message IdRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.common.IIdRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified IdRequest message, length delimited. Does not implicitly {@link ultra.common.IdRequest.verify|verify} messages.
             * @param message IdRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.common.IIdRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an IdRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns IdRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.common.IdRequest;

            /**
             * Decodes an IdRequest message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns IdRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.common.IdRequest;

            /**
             * Verifies an IdRequest message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates an IdRequest message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns IdRequest
             */
            public static fromObject(object: { [k: string]: any }): ultra.common.IdRequest;

            /**
             * Creates a plain object from an IdRequest message. Also converts values to other types if specified.
             * @param message IdRequest
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.common.IdRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this IdRequest to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for IdRequest
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a DeleteResponse. */
        interface IDeleteResponse {

            /** DeleteResponse success */
            success?: (boolean|null);
        }

        /** Represents a DeleteResponse. */
        class DeleteResponse implements IDeleteResponse {

            /**
             * Constructs a new DeleteResponse.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.common.IDeleteResponse);

            /** DeleteResponse success. */
            public success: boolean;

            /**
             * Creates a new DeleteResponse instance using the specified properties.
             * @param [properties] Properties to set
             * @returns DeleteResponse instance
             */
            public static create(properties?: ultra.common.IDeleteResponse): ultra.common.DeleteResponse;

            /**
             * Encodes the specified DeleteResponse message. Does not implicitly {@link ultra.common.DeleteResponse.verify|verify} messages.
             * @param message DeleteResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.common.IDeleteResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified DeleteResponse message, length delimited. Does not implicitly {@link ultra.common.DeleteResponse.verify|verify} messages.
             * @param message DeleteResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.common.IDeleteResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a DeleteResponse message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns DeleteResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.common.DeleteResponse;

            /**
             * Decodes a DeleteResponse message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns DeleteResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.common.DeleteResponse;

            /**
             * Verifies a DeleteResponse message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a DeleteResponse message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns DeleteResponse
             */
            public static fromObject(object: { [k: string]: any }): ultra.common.DeleteResponse;

            /**
             * Creates a plain object from a DeleteResponse message. Also converts values to other types if specified.
             * @param message DeleteResponse
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.common.DeleteResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this DeleteResponse to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for DeleteResponse
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }
    }

    /** Namespace conversations. */
    namespace conversations {

        /** Properties of a Conversation. */
        interface IConversation {

            /** Conversation id */
            id?: (string|null);

            /** Conversation title */
            title?: (string|null);

            /** Conversation status */
            status?: (string|null);

            /** Conversation orchestratorModelId */
            orchestratorModelId?: (string|null);

            /** Conversation activeSkillIds */
            activeSkillIds?: (string|null);

            /** Conversation createdAt */
            createdAt?: (number|Long|null);

            /** Conversation updatedAt */
            updatedAt?: (number|Long|null);
        }

        /** Represents a Conversation. */
        class Conversation implements IConversation {

            /**
             * Constructs a new Conversation.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.conversations.IConversation);

            /** Conversation id. */
            public id: string;

            /** Conversation title. */
            public title: string;

            /** Conversation status. */
            public status: string;

            /** Conversation orchestratorModelId. */
            public orchestratorModelId: string;

            /** Conversation activeSkillIds. */
            public activeSkillIds: string;

            /** Conversation createdAt. */
            public createdAt: (number|Long);

            /** Conversation updatedAt. */
            public updatedAt: (number|Long);

            /**
             * Creates a new Conversation instance using the specified properties.
             * @param [properties] Properties to set
             * @returns Conversation instance
             */
            public static create(properties?: ultra.conversations.IConversation): ultra.conversations.Conversation;

            /**
             * Encodes the specified Conversation message. Does not implicitly {@link ultra.conversations.Conversation.verify|verify} messages.
             * @param message Conversation message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.conversations.IConversation, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified Conversation message, length delimited. Does not implicitly {@link ultra.conversations.Conversation.verify|verify} messages.
             * @param message Conversation message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.conversations.IConversation, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a Conversation message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns Conversation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.conversations.Conversation;

            /**
             * Decodes a Conversation message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns Conversation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.conversations.Conversation;

            /**
             * Verifies a Conversation message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a Conversation message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns Conversation
             */
            public static fromObject(object: { [k: string]: any }): ultra.conversations.Conversation;

            /**
             * Creates a plain object from a Conversation message. Also converts values to other types if specified.
             * @param message Conversation
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.conversations.Conversation, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Conversation to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for Conversation
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a ConversationList. */
        interface IConversationList {

            /** ConversationList conversations */
            conversations?: (ultra.conversations.IConversation[]|null);
        }

        /** Represents a ConversationList. */
        class ConversationList implements IConversationList {

            /**
             * Constructs a new ConversationList.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.conversations.IConversationList);

            /** ConversationList conversations. */
            public conversations: ultra.conversations.IConversation[];

            /**
             * Creates a new ConversationList instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ConversationList instance
             */
            public static create(properties?: ultra.conversations.IConversationList): ultra.conversations.ConversationList;

            /**
             * Encodes the specified ConversationList message. Does not implicitly {@link ultra.conversations.ConversationList.verify|verify} messages.
             * @param message ConversationList message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.conversations.IConversationList, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified ConversationList message, length delimited. Does not implicitly {@link ultra.conversations.ConversationList.verify|verify} messages.
             * @param message ConversationList message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.conversations.IConversationList, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ConversationList message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns ConversationList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.conversations.ConversationList;

            /**
             * Decodes a ConversationList message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns ConversationList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.conversations.ConversationList;

            /**
             * Verifies a ConversationList message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a ConversationList message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ConversationList
             */
            public static fromObject(object: { [k: string]: any }): ultra.conversations.ConversationList;

            /**
             * Creates a plain object from a ConversationList message. Also converts values to other types if specified.
             * @param message ConversationList
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.conversations.ConversationList, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ConversationList to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for ConversationList
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a Message. */
        interface IMessage {

            /** Message id */
            id?: (string|null);

            /** Message conversationId */
            conversationId?: (string|null);

            /** Message role */
            role?: (string|null);

            /** Message content */
            content?: (string|null);

            /** Message modelId */
            modelId?: (string|null);

            /** Message agentId */
            agentId?: (string|null);

            /** Message taskId */
            taskId?: (string|null);

            /** Message metadata */
            metadata?: (string|null);

            /** Message createdAt */
            createdAt?: (number|Long|null);
        }

        /** Represents a Message. */
        class Message implements IMessage {

            /**
             * Constructs a new Message.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.conversations.IMessage);

            /** Message id. */
            public id: string;

            /** Message conversationId. */
            public conversationId: string;

            /** Message role. */
            public role: string;

            /** Message content. */
            public content: string;

            /** Message modelId. */
            public modelId: string;

            /** Message agentId. */
            public agentId: string;

            /** Message taskId. */
            public taskId: string;

            /** Message metadata. */
            public metadata: string;

            /** Message createdAt. */
            public createdAt: (number|Long);

            /**
             * Creates a new Message instance using the specified properties.
             * @param [properties] Properties to set
             * @returns Message instance
             */
            public static create(properties?: ultra.conversations.IMessage): ultra.conversations.Message;

            /**
             * Encodes the specified Message message. Does not implicitly {@link ultra.conversations.Message.verify|verify} messages.
             * @param message Message message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.conversations.IMessage, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified Message message, length delimited. Does not implicitly {@link ultra.conversations.Message.verify|verify} messages.
             * @param message Message message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.conversations.IMessage, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a Message message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns Message
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.conversations.Message;

            /**
             * Decodes a Message message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns Message
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.conversations.Message;

            /**
             * Verifies a Message message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a Message message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns Message
             */
            public static fromObject(object: { [k: string]: any }): ultra.conversations.Message;

            /**
             * Creates a plain object from a Message message. Also converts values to other types if specified.
             * @param message Message
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.conversations.Message, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Message to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for Message
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a MessageList. */
        interface IMessageList {

            /** MessageList messages */
            messages?: (ultra.conversations.IMessage[]|null);
        }

        /** Represents a MessageList. */
        class MessageList implements IMessageList {

            /**
             * Constructs a new MessageList.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.conversations.IMessageList);

            /** MessageList messages. */
            public messages: ultra.conversations.IMessage[];

            /**
             * Creates a new MessageList instance using the specified properties.
             * @param [properties] Properties to set
             * @returns MessageList instance
             */
            public static create(properties?: ultra.conversations.IMessageList): ultra.conversations.MessageList;

            /**
             * Encodes the specified MessageList message. Does not implicitly {@link ultra.conversations.MessageList.verify|verify} messages.
             * @param message MessageList message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.conversations.IMessageList, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified MessageList message, length delimited. Does not implicitly {@link ultra.conversations.MessageList.verify|verify} messages.
             * @param message MessageList message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.conversations.IMessageList, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a MessageList message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns MessageList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.conversations.MessageList;

            /**
             * Decodes a MessageList message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns MessageList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.conversations.MessageList;

            /**
             * Verifies a MessageList message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a MessageList message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns MessageList
             */
            public static fromObject(object: { [k: string]: any }): ultra.conversations.MessageList;

            /**
             * Creates a plain object from a MessageList message. Also converts values to other types if specified.
             * @param message MessageList
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.conversations.MessageList, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this MessageList to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for MessageList
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a CreateConversationRequest. */
        interface ICreateConversationRequest {

            /** CreateConversationRequest title */
            title?: (string|null);

            /** CreateConversationRequest orchestratorModelId */
            orchestratorModelId?: (string|null);
        }

        /** Represents a CreateConversationRequest. */
        class CreateConversationRequest implements ICreateConversationRequest {

            /**
             * Constructs a new CreateConversationRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.conversations.ICreateConversationRequest);

            /** CreateConversationRequest title. */
            public title: string;

            /** CreateConversationRequest orchestratorModelId. */
            public orchestratorModelId: string;

            /**
             * Creates a new CreateConversationRequest instance using the specified properties.
             * @param [properties] Properties to set
             * @returns CreateConversationRequest instance
             */
            public static create(properties?: ultra.conversations.ICreateConversationRequest): ultra.conversations.CreateConversationRequest;

            /**
             * Encodes the specified CreateConversationRequest message. Does not implicitly {@link ultra.conversations.CreateConversationRequest.verify|verify} messages.
             * @param message CreateConversationRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.conversations.ICreateConversationRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified CreateConversationRequest message, length delimited. Does not implicitly {@link ultra.conversations.CreateConversationRequest.verify|verify} messages.
             * @param message CreateConversationRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.conversations.ICreateConversationRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a CreateConversationRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns CreateConversationRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.conversations.CreateConversationRequest;

            /**
             * Decodes a CreateConversationRequest message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns CreateConversationRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.conversations.CreateConversationRequest;

            /**
             * Verifies a CreateConversationRequest message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a CreateConversationRequest message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns CreateConversationRequest
             */
            public static fromObject(object: { [k: string]: any }): ultra.conversations.CreateConversationRequest;

            /**
             * Creates a plain object from a CreateConversationRequest message. Also converts values to other types if specified.
             * @param message CreateConversationRequest
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.conversations.CreateConversationRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this CreateConversationRequest to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for CreateConversationRequest
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of an UpdateConversationRequest. */
        interface IUpdateConversationRequest {

            /** UpdateConversationRequest id */
            id?: (string|null);

            /** UpdateConversationRequest title */
            title?: (string|null);

            /** UpdateConversationRequest status */
            status?: (string|null);

            /** UpdateConversationRequest orchestratorModelId */
            orchestratorModelId?: (string|null);
        }

        /** Represents an UpdateConversationRequest. */
        class UpdateConversationRequest implements IUpdateConversationRequest {

            /**
             * Constructs a new UpdateConversationRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.conversations.IUpdateConversationRequest);

            /** UpdateConversationRequest id. */
            public id: string;

            /** UpdateConversationRequest title. */
            public title: string;

            /** UpdateConversationRequest status. */
            public status: string;

            /** UpdateConversationRequest orchestratorModelId. */
            public orchestratorModelId: string;

            /**
             * Creates a new UpdateConversationRequest instance using the specified properties.
             * @param [properties] Properties to set
             * @returns UpdateConversationRequest instance
             */
            public static create(properties?: ultra.conversations.IUpdateConversationRequest): ultra.conversations.UpdateConversationRequest;

            /**
             * Encodes the specified UpdateConversationRequest message. Does not implicitly {@link ultra.conversations.UpdateConversationRequest.verify|verify} messages.
             * @param message UpdateConversationRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.conversations.IUpdateConversationRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified UpdateConversationRequest message, length delimited. Does not implicitly {@link ultra.conversations.UpdateConversationRequest.verify|verify} messages.
             * @param message UpdateConversationRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.conversations.IUpdateConversationRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an UpdateConversationRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns UpdateConversationRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.conversations.UpdateConversationRequest;

            /**
             * Decodes an UpdateConversationRequest message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns UpdateConversationRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.conversations.UpdateConversationRequest;

            /**
             * Verifies an UpdateConversationRequest message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates an UpdateConversationRequest message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns UpdateConversationRequest
             */
            public static fromObject(object: { [k: string]: any }): ultra.conversations.UpdateConversationRequest;

            /**
             * Creates a plain object from an UpdateConversationRequest message. Also converts values to other types if specified.
             * @param message UpdateConversationRequest
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.conversations.UpdateConversationRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this UpdateConversationRequest to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for UpdateConversationRequest
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a SendMessageRequest. */
        interface ISendMessageRequest {

            /** SendMessageRequest conversationId */
            conversationId?: (string|null);

            /** SendMessageRequest content */
            content?: (string|null);
        }

        /** Represents a SendMessageRequest. */
        class SendMessageRequest implements ISendMessageRequest {

            /**
             * Constructs a new SendMessageRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.conversations.ISendMessageRequest);

            /** SendMessageRequest conversationId. */
            public conversationId: string;

            /** SendMessageRequest content. */
            public content: string;

            /**
             * Creates a new SendMessageRequest instance using the specified properties.
             * @param [properties] Properties to set
             * @returns SendMessageRequest instance
             */
            public static create(properties?: ultra.conversations.ISendMessageRequest): ultra.conversations.SendMessageRequest;

            /**
             * Encodes the specified SendMessageRequest message. Does not implicitly {@link ultra.conversations.SendMessageRequest.verify|verify} messages.
             * @param message SendMessageRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.conversations.ISendMessageRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified SendMessageRequest message, length delimited. Does not implicitly {@link ultra.conversations.SendMessageRequest.verify|verify} messages.
             * @param message SendMessageRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.conversations.ISendMessageRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a SendMessageRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns SendMessageRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.conversations.SendMessageRequest;

            /**
             * Decodes a SendMessageRequest message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns SendMessageRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.conversations.SendMessageRequest;

            /**
             * Verifies a SendMessageRequest message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a SendMessageRequest message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns SendMessageRequest
             */
            public static fromObject(object: { [k: string]: any }): ultra.conversations.SendMessageRequest;

            /**
             * Creates a plain object from a SendMessageRequest message. Also converts values to other types if specified.
             * @param message SendMessageRequest
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.conversations.SendMessageRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this SendMessageRequest to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for SendMessageRequest
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a StreamEvent. */
        interface IStreamEvent {

            /** StreamEvent type */
            type?: (string|null);

            /** StreamEvent payload */
            payload?: (string|null);
        }

        /** Represents a StreamEvent. */
        class StreamEvent implements IStreamEvent {

            /**
             * Constructs a new StreamEvent.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.conversations.IStreamEvent);

            /** StreamEvent type. */
            public type: string;

            /** StreamEvent payload. */
            public payload: string;

            /**
             * Creates a new StreamEvent instance using the specified properties.
             * @param [properties] Properties to set
             * @returns StreamEvent instance
             */
            public static create(properties?: ultra.conversations.IStreamEvent): ultra.conversations.StreamEvent;

            /**
             * Encodes the specified StreamEvent message. Does not implicitly {@link ultra.conversations.StreamEvent.verify|verify} messages.
             * @param message StreamEvent message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.conversations.IStreamEvent, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified StreamEvent message, length delimited. Does not implicitly {@link ultra.conversations.StreamEvent.verify|verify} messages.
             * @param message StreamEvent message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.conversations.IStreamEvent, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a StreamEvent message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns StreamEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.conversations.StreamEvent;

            /**
             * Decodes a StreamEvent message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns StreamEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.conversations.StreamEvent;

            /**
             * Verifies a StreamEvent message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a StreamEvent message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns StreamEvent
             */
            public static fromObject(object: { [k: string]: any }): ultra.conversations.StreamEvent;

            /**
             * Creates a plain object from a StreamEvent message. Also converts values to other types if specified.
             * @param message StreamEvent
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.conversations.StreamEvent, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this StreamEvent to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for StreamEvent
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Represents a ConversationService */
        class ConversationService extends $protobuf.rpc.Service {

            /**
             * Constructs a new ConversationService service.
             * @param rpcImpl RPC implementation
             * @param [requestDelimited=false] Whether requests are length-delimited
             * @param [responseDelimited=false] Whether responses are length-delimited
             */
            constructor(rpcImpl: $protobuf.RPCImpl, requestDelimited?: boolean, responseDelimited?: boolean);

            /**
             * Creates new ConversationService service using the specified rpc implementation.
             * @param rpcImpl RPC implementation
             * @param [requestDelimited=false] Whether requests are length-delimited
             * @param [responseDelimited=false] Whether responses are length-delimited
             * @returns RPC service. Useful where requests and/or responses are streamed.
             */
            public static create(rpcImpl: $protobuf.RPCImpl, requestDelimited?: boolean, responseDelimited?: boolean): ConversationService;

            /**
             * Calls ListConversations.
             * @param request Empty message or plain object
             * @param callback Node-style callback called with the error, if any, and ConversationList
             */
            public listConversations(request: ultra.common.IEmpty, callback: ultra.conversations.ConversationService.ListConversationsCallback): void;

            /**
             * Calls ListConversations.
             * @param request Empty message or plain object
             * @returns Promise
             */
            public listConversations(request: ultra.common.IEmpty): Promise<ultra.conversations.ConversationList>;

            /**
             * Calls GetConversation.
             * @param request IdRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and Conversation
             */
            public getConversation(request: ultra.common.IIdRequest, callback: ultra.conversations.ConversationService.GetConversationCallback): void;

            /**
             * Calls GetConversation.
             * @param request IdRequest message or plain object
             * @returns Promise
             */
            public getConversation(request: ultra.common.IIdRequest): Promise<ultra.conversations.Conversation>;

            /**
             * Calls CreateConversation.
             * @param request CreateConversationRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and Conversation
             */
            public createConversation(request: ultra.conversations.ICreateConversationRequest, callback: ultra.conversations.ConversationService.CreateConversationCallback): void;

            /**
             * Calls CreateConversation.
             * @param request CreateConversationRequest message or plain object
             * @returns Promise
             */
            public createConversation(request: ultra.conversations.ICreateConversationRequest): Promise<ultra.conversations.Conversation>;

            /**
             * Calls UpdateConversation.
             * @param request UpdateConversationRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and Conversation
             */
            public updateConversation(request: ultra.conversations.IUpdateConversationRequest, callback: ultra.conversations.ConversationService.UpdateConversationCallback): void;

            /**
             * Calls UpdateConversation.
             * @param request UpdateConversationRequest message or plain object
             * @returns Promise
             */
            public updateConversation(request: ultra.conversations.IUpdateConversationRequest): Promise<ultra.conversations.Conversation>;

            /**
             * Calls DeleteConversation.
             * @param request IdRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and DeleteResponse
             */
            public deleteConversation(request: ultra.common.IIdRequest, callback: ultra.conversations.ConversationService.DeleteConversationCallback): void;

            /**
             * Calls DeleteConversation.
             * @param request IdRequest message or plain object
             * @returns Promise
             */
            public deleteConversation(request: ultra.common.IIdRequest): Promise<ultra.common.DeleteResponse>;

            /**
             * Calls GetMessages.
             * @param request IdRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and MessageList
             */
            public getMessages(request: ultra.common.IIdRequest, callback: ultra.conversations.ConversationService.GetMessagesCallback): void;

            /**
             * Calls GetMessages.
             * @param request IdRequest message or plain object
             * @returns Promise
             */
            public getMessages(request: ultra.common.IIdRequest): Promise<ultra.conversations.MessageList>;

            /**
             * Calls SendMessage.
             * @param request SendMessageRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and Message
             */
            public sendMessage(request: ultra.conversations.ISendMessageRequest, callback: ultra.conversations.ConversationService.SendMessageCallback): void;

            /**
             * Calls SendMessage.
             * @param request SendMessageRequest message or plain object
             * @returns Promise
             */
            public sendMessage(request: ultra.conversations.ISendMessageRequest): Promise<ultra.conversations.Message>;

            /**
             * Calls StreamConversation.
             * @param request IdRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and StreamEvent
             */
            public streamConversation(request: ultra.common.IIdRequest, callback: ultra.conversations.ConversationService.StreamConversationCallback): void;

            /**
             * Calls StreamConversation.
             * @param request IdRequest message or plain object
             * @returns Promise
             */
            public streamConversation(request: ultra.common.IIdRequest): Promise<ultra.conversations.StreamEvent>;
        }

        namespace ConversationService {

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#listConversations}.
             * @param error Error, if any
             * @param [response] ConversationList
             */
            type ListConversationsCallback = (error: (Error|null), response?: ultra.conversations.ConversationList) => void;

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#getConversation}.
             * @param error Error, if any
             * @param [response] Conversation
             */
            type GetConversationCallback = (error: (Error|null), response?: ultra.conversations.Conversation) => void;

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#createConversation}.
             * @param error Error, if any
             * @param [response] Conversation
             */
            type CreateConversationCallback = (error: (Error|null), response?: ultra.conversations.Conversation) => void;

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#updateConversation}.
             * @param error Error, if any
             * @param [response] Conversation
             */
            type UpdateConversationCallback = (error: (Error|null), response?: ultra.conversations.Conversation) => void;

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#deleteConversation}.
             * @param error Error, if any
             * @param [response] DeleteResponse
             */
            type DeleteConversationCallback = (error: (Error|null), response?: ultra.common.DeleteResponse) => void;

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#getMessages}.
             * @param error Error, if any
             * @param [response] MessageList
             */
            type GetMessagesCallback = (error: (Error|null), response?: ultra.conversations.MessageList) => void;

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#sendMessage}.
             * @param error Error, if any
             * @param [response] Message
             */
            type SendMessageCallback = (error: (Error|null), response?: ultra.conversations.Message) => void;

            /**
             * Callback as used by {@link ultra.conversations.ConversationService#streamConversation}.
             * @param error Error, if any
             * @param [response] StreamEvent
             */
            type StreamConversationCallback = (error: (Error|null), response?: ultra.conversations.StreamEvent) => void;
        }
    }

    /** Namespace models. */
    namespace models {

        /** Properties of a Model. */
        interface IModel {

            /** Model id */
            id?: (string|null);

            /** Model name */
            name?: (string|null);

            /** Model provider */
            provider?: (string|null);

            /** Model modelId */
            modelId?: (string|null);

            /** Model baseUrl */
            baseUrl?: (string|null);

            /** Model enabled */
            enabled?: (boolean|null);

            /** Model capabilities */
            capabilities?: (string|null);

            /** Model contextWindow */
            contextWindow?: (number|null);

            /** Model isDefault */
            isDefault?: (boolean|null);

            /** Model isOrchestrator */
            isOrchestrator?: (boolean|null);

            /** Model speedTier */
            speedTier?: (string|null);

            /** Model notes */
            notes?: (string|null);

            /** Model authMethod */
            authMethod?: (string|null);

            /** Model connectionStatus */
            connectionStatus?: (string|null);

            /** Model connectionError */
            connectionError?: (string|null);

            /** Model lastTestedAt */
            lastTestedAt?: (number|Long|null);

            /** Model lastTestLatency */
            lastTestLatency?: (number|null);

            /** Model createdAt */
            createdAt?: (number|Long|null);
        }

        /** Represents a Model. */
        class Model implements IModel {

            /**
             * Constructs a new Model.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.models.IModel);

            /** Model id. */
            public id: string;

            /** Model name. */
            public name: string;

            /** Model provider. */
            public provider: string;

            /** Model modelId. */
            public modelId: string;

            /** Model baseUrl. */
            public baseUrl: string;

            /** Model enabled. */
            public enabled: boolean;

            /** Model capabilities. */
            public capabilities: string;

            /** Model contextWindow. */
            public contextWindow: number;

            /** Model isDefault. */
            public isDefault: boolean;

            /** Model isOrchestrator. */
            public isOrchestrator: boolean;

            /** Model speedTier. */
            public speedTier: string;

            /** Model notes. */
            public notes: string;

            /** Model authMethod. */
            public authMethod: string;

            /** Model connectionStatus. */
            public connectionStatus: string;

            /** Model connectionError. */
            public connectionError: string;

            /** Model lastTestedAt. */
            public lastTestedAt: (number|Long);

            /** Model lastTestLatency. */
            public lastTestLatency: number;

            /** Model createdAt. */
            public createdAt: (number|Long);

            /**
             * Creates a new Model instance using the specified properties.
             * @param [properties] Properties to set
             * @returns Model instance
             */
            public static create(properties?: ultra.models.IModel): ultra.models.Model;

            /**
             * Encodes the specified Model message. Does not implicitly {@link ultra.models.Model.verify|verify} messages.
             * @param message Model message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.models.IModel, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified Model message, length delimited. Does not implicitly {@link ultra.models.Model.verify|verify} messages.
             * @param message Model message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.models.IModel, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a Model message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns Model
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.models.Model;

            /**
             * Decodes a Model message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns Model
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.models.Model;

            /**
             * Verifies a Model message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a Model message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns Model
             */
            public static fromObject(object: { [k: string]: any }): ultra.models.Model;

            /**
             * Creates a plain object from a Model message. Also converts values to other types if specified.
             * @param message Model
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.models.Model, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Model to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for Model
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a ModelList. */
        interface IModelList {

            /** ModelList models */
            models?: (ultra.models.IModel[]|null);
        }

        /** Represents a ModelList. */
        class ModelList implements IModelList {

            /**
             * Constructs a new ModelList.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.models.IModelList);

            /** ModelList models. */
            public models: ultra.models.IModel[];

            /**
             * Creates a new ModelList instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ModelList instance
             */
            public static create(properties?: ultra.models.IModelList): ultra.models.ModelList;

            /**
             * Encodes the specified ModelList message. Does not implicitly {@link ultra.models.ModelList.verify|verify} messages.
             * @param message ModelList message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.models.IModelList, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified ModelList message, length delimited. Does not implicitly {@link ultra.models.ModelList.verify|verify} messages.
             * @param message ModelList message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.models.IModelList, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ModelList message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns ModelList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.models.ModelList;

            /**
             * Decodes a ModelList message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns ModelList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.models.ModelList;

            /**
             * Verifies a ModelList message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a ModelList message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ModelList
             */
            public static fromObject(object: { [k: string]: any }): ultra.models.ModelList;

            /**
             * Creates a plain object from a ModelList message. Also converts values to other types if specified.
             * @param message ModelList
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.models.ModelList, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ModelList to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for ModelList
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a CreateModelRequest. */
        interface ICreateModelRequest {

            /** CreateModelRequest name */
            name?: (string|null);

            /** CreateModelRequest provider */
            provider?: (string|null);

            /** CreateModelRequest modelId */
            modelId?: (string|null);

            /** CreateModelRequest baseUrl */
            baseUrl?: (string|null);

            /** CreateModelRequest authMethod */
            authMethod?: (string|null);

            /** CreateModelRequest speedTier */
            speedTier?: (string|null);

            /** CreateModelRequest notes */
            notes?: (string|null);

            /** CreateModelRequest contextWindow */
            contextWindow?: (number|null);
        }

        /** Represents a CreateModelRequest. */
        class CreateModelRequest implements ICreateModelRequest {

            /**
             * Constructs a new CreateModelRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.models.ICreateModelRequest);

            /** CreateModelRequest name. */
            public name: string;

            /** CreateModelRequest provider. */
            public provider: string;

            /** CreateModelRequest modelId. */
            public modelId: string;

            /** CreateModelRequest baseUrl. */
            public baseUrl: string;

            /** CreateModelRequest authMethod. */
            public authMethod: string;

            /** CreateModelRequest speedTier. */
            public speedTier: string;

            /** CreateModelRequest notes. */
            public notes: string;

            /** CreateModelRequest contextWindow. */
            public contextWindow: number;

            /**
             * Creates a new CreateModelRequest instance using the specified properties.
             * @param [properties] Properties to set
             * @returns CreateModelRequest instance
             */
            public static create(properties?: ultra.models.ICreateModelRequest): ultra.models.CreateModelRequest;

            /**
             * Encodes the specified CreateModelRequest message. Does not implicitly {@link ultra.models.CreateModelRequest.verify|verify} messages.
             * @param message CreateModelRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.models.ICreateModelRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified CreateModelRequest message, length delimited. Does not implicitly {@link ultra.models.CreateModelRequest.verify|verify} messages.
             * @param message CreateModelRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.models.ICreateModelRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a CreateModelRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns CreateModelRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.models.CreateModelRequest;

            /**
             * Decodes a CreateModelRequest message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns CreateModelRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.models.CreateModelRequest;

            /**
             * Verifies a CreateModelRequest message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a CreateModelRequest message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns CreateModelRequest
             */
            public static fromObject(object: { [k: string]: any }): ultra.models.CreateModelRequest;

            /**
             * Creates a plain object from a CreateModelRequest message. Also converts values to other types if specified.
             * @param message CreateModelRequest
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.models.CreateModelRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this CreateModelRequest to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for CreateModelRequest
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a TestModelResponse. */
        interface ITestModelResponse {

            /** TestModelResponse ok */
            ok?: (boolean|null);

            /** TestModelResponse latency */
            latency?: (number|null);

            /** TestModelResponse status */
            status?: (string|null);

            /** TestModelResponse error */
            error?: (string|null);
        }

        /** Represents a TestModelResponse. */
        class TestModelResponse implements ITestModelResponse {

            /**
             * Constructs a new TestModelResponse.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.models.ITestModelResponse);

            /** TestModelResponse ok. */
            public ok: boolean;

            /** TestModelResponse latency. */
            public latency: number;

            /** TestModelResponse status. */
            public status: string;

            /** TestModelResponse error. */
            public error: string;

            /**
             * Creates a new TestModelResponse instance using the specified properties.
             * @param [properties] Properties to set
             * @returns TestModelResponse instance
             */
            public static create(properties?: ultra.models.ITestModelResponse): ultra.models.TestModelResponse;

            /**
             * Encodes the specified TestModelResponse message. Does not implicitly {@link ultra.models.TestModelResponse.verify|verify} messages.
             * @param message TestModelResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.models.ITestModelResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified TestModelResponse message, length delimited. Does not implicitly {@link ultra.models.TestModelResponse.verify|verify} messages.
             * @param message TestModelResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.models.ITestModelResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a TestModelResponse message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns TestModelResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.models.TestModelResponse;

            /**
             * Decodes a TestModelResponse message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns TestModelResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.models.TestModelResponse;

            /**
             * Verifies a TestModelResponse message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a TestModelResponse message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns TestModelResponse
             */
            public static fromObject(object: { [k: string]: any }): ultra.models.TestModelResponse;

            /**
             * Creates a plain object from a TestModelResponse message. Also converts values to other types if specified.
             * @param message TestModelResponse
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.models.TestModelResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this TestModelResponse to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for TestModelResponse
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Represents a ModelService */
        class ModelService extends $protobuf.rpc.Service {

            /**
             * Constructs a new ModelService service.
             * @param rpcImpl RPC implementation
             * @param [requestDelimited=false] Whether requests are length-delimited
             * @param [responseDelimited=false] Whether responses are length-delimited
             */
            constructor(rpcImpl: $protobuf.RPCImpl, requestDelimited?: boolean, responseDelimited?: boolean);

            /**
             * Creates new ModelService service using the specified rpc implementation.
             * @param rpcImpl RPC implementation
             * @param [requestDelimited=false] Whether requests are length-delimited
             * @param [responseDelimited=false] Whether responses are length-delimited
             * @returns RPC service. Useful where requests and/or responses are streamed.
             */
            public static create(rpcImpl: $protobuf.RPCImpl, requestDelimited?: boolean, responseDelimited?: boolean): ModelService;

            /**
             * Calls ListModels.
             * @param request Empty message or plain object
             * @param callback Node-style callback called with the error, if any, and ModelList
             */
            public listModels(request: ultra.common.IEmpty, callback: ultra.models.ModelService.ListModelsCallback): void;

            /**
             * Calls ListModels.
             * @param request Empty message or plain object
             * @returns Promise
             */
            public listModels(request: ultra.common.IEmpty): Promise<ultra.models.ModelList>;

            /**
             * Calls GetModel.
             * @param request IdRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and Model
             */
            public getModel(request: ultra.common.IIdRequest, callback: ultra.models.ModelService.GetModelCallback): void;

            /**
             * Calls GetModel.
             * @param request IdRequest message or plain object
             * @returns Promise
             */
            public getModel(request: ultra.common.IIdRequest): Promise<ultra.models.Model>;

            /**
             * Calls CreateModel.
             * @param request CreateModelRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and Model
             */
            public createModel(request: ultra.models.ICreateModelRequest, callback: ultra.models.ModelService.CreateModelCallback): void;

            /**
             * Calls CreateModel.
             * @param request CreateModelRequest message or plain object
             * @returns Promise
             */
            public createModel(request: ultra.models.ICreateModelRequest): Promise<ultra.models.Model>;

            /**
             * Calls DeleteModel.
             * @param request IdRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and DeleteResponse
             */
            public deleteModel(request: ultra.common.IIdRequest, callback: ultra.models.ModelService.DeleteModelCallback): void;

            /**
             * Calls DeleteModel.
             * @param request IdRequest message or plain object
             * @returns Promise
             */
            public deleteModel(request: ultra.common.IIdRequest): Promise<ultra.common.DeleteResponse>;

            /**
             * Calls TestModel.
             * @param request IdRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and TestModelResponse
             */
            public testModel(request: ultra.common.IIdRequest, callback: ultra.models.ModelService.TestModelCallback): void;

            /**
             * Calls TestModel.
             * @param request IdRequest message or plain object
             * @returns Promise
             */
            public testModel(request: ultra.common.IIdRequest): Promise<ultra.models.TestModelResponse>;
        }

        namespace ModelService {

            /**
             * Callback as used by {@link ultra.models.ModelService#listModels}.
             * @param error Error, if any
             * @param [response] ModelList
             */
            type ListModelsCallback = (error: (Error|null), response?: ultra.models.ModelList) => void;

            /**
             * Callback as used by {@link ultra.models.ModelService#getModel}.
             * @param error Error, if any
             * @param [response] Model
             */
            type GetModelCallback = (error: (Error|null), response?: ultra.models.Model) => void;

            /**
             * Callback as used by {@link ultra.models.ModelService#createModel}.
             * @param error Error, if any
             * @param [response] Model
             */
            type CreateModelCallback = (error: (Error|null), response?: ultra.models.Model) => void;

            /**
             * Callback as used by {@link ultra.models.ModelService#deleteModel}.
             * @param error Error, if any
             * @param [response] DeleteResponse
             */
            type DeleteModelCallback = (error: (Error|null), response?: ultra.common.DeleteResponse) => void;

            /**
             * Callback as used by {@link ultra.models.ModelService#testModel}.
             * @param error Error, if any
             * @param [response] TestModelResponse
             */
            type TestModelCallback = (error: (Error|null), response?: ultra.models.TestModelResponse) => void;
        }
    }

    /** Namespace knowledge. */
    namespace knowledge {

        /** Properties of a KnowledgeEntry. */
        interface IKnowledgeEntry {

            /** KnowledgeEntry id */
            id?: (string|null);

            /** KnowledgeEntry name */
            name?: (string|null);

            /** KnowledgeEntry description */
            description?: (string|null);

            /** KnowledgeEntry content */
            content?: (string|null);

            /** KnowledgeEntry summary */
            summary?: (string|null);

            /** KnowledgeEntry contentType */
            contentType?: (string|null);

            /** KnowledgeEntry category */
            category?: (string|null);

            /** KnowledgeEntry tags */
            tags?: (string|null);

            /** KnowledgeEntry sizeBytes */
            sizeBytes?: (number|null);

            /** KnowledgeEntry tokenEstimate */
            tokenEstimate?: (number|null);

            /** KnowledgeEntry enabled */
            enabled?: (boolean|null);

            /** KnowledgeEntry priority */
            priority?: (number|null);

            /** KnowledgeEntry tierPolicy */
            tierPolicy?: (string|null);

            /** KnowledgeEntry createdAt */
            createdAt?: (number|Long|null);

            /** KnowledgeEntry updatedAt */
            updatedAt?: (number|Long|null);
        }

        /** Represents a KnowledgeEntry. */
        class KnowledgeEntry implements IKnowledgeEntry {

            /**
             * Constructs a new KnowledgeEntry.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.knowledge.IKnowledgeEntry);

            /** KnowledgeEntry id. */
            public id: string;

            /** KnowledgeEntry name. */
            public name: string;

            /** KnowledgeEntry description. */
            public description: string;

            /** KnowledgeEntry content. */
            public content: string;

            /** KnowledgeEntry summary. */
            public summary: string;

            /** KnowledgeEntry contentType. */
            public contentType: string;

            /** KnowledgeEntry category. */
            public category: string;

            /** KnowledgeEntry tags. */
            public tags: string;

            /** KnowledgeEntry sizeBytes. */
            public sizeBytes: number;

            /** KnowledgeEntry tokenEstimate. */
            public tokenEstimate: number;

            /** KnowledgeEntry enabled. */
            public enabled: boolean;

            /** KnowledgeEntry priority. */
            public priority: number;

            /** KnowledgeEntry tierPolicy. */
            public tierPolicy: string;

            /** KnowledgeEntry createdAt. */
            public createdAt: (number|Long);

            /** KnowledgeEntry updatedAt. */
            public updatedAt: (number|Long);

            /**
             * Creates a new KnowledgeEntry instance using the specified properties.
             * @param [properties] Properties to set
             * @returns KnowledgeEntry instance
             */
            public static create(properties?: ultra.knowledge.IKnowledgeEntry): ultra.knowledge.KnowledgeEntry;

            /**
             * Encodes the specified KnowledgeEntry message. Does not implicitly {@link ultra.knowledge.KnowledgeEntry.verify|verify} messages.
             * @param message KnowledgeEntry message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.knowledge.IKnowledgeEntry, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified KnowledgeEntry message, length delimited. Does not implicitly {@link ultra.knowledge.KnowledgeEntry.verify|verify} messages.
             * @param message KnowledgeEntry message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.knowledge.IKnowledgeEntry, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a KnowledgeEntry message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns KnowledgeEntry
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.knowledge.KnowledgeEntry;

            /**
             * Decodes a KnowledgeEntry message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns KnowledgeEntry
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.knowledge.KnowledgeEntry;

            /**
             * Verifies a KnowledgeEntry message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a KnowledgeEntry message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns KnowledgeEntry
             */
            public static fromObject(object: { [k: string]: any }): ultra.knowledge.KnowledgeEntry;

            /**
             * Creates a plain object from a KnowledgeEntry message. Also converts values to other types if specified.
             * @param message KnowledgeEntry
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.knowledge.KnowledgeEntry, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this KnowledgeEntry to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for KnowledgeEntry
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a KnowledgeList. */
        interface IKnowledgeList {

            /** KnowledgeList entries */
            entries?: (ultra.knowledge.IKnowledgeEntry[]|null);
        }

        /** Represents a KnowledgeList. */
        class KnowledgeList implements IKnowledgeList {

            /**
             * Constructs a new KnowledgeList.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.knowledge.IKnowledgeList);

            /** KnowledgeList entries. */
            public entries: ultra.knowledge.IKnowledgeEntry[];

            /**
             * Creates a new KnowledgeList instance using the specified properties.
             * @param [properties] Properties to set
             * @returns KnowledgeList instance
             */
            public static create(properties?: ultra.knowledge.IKnowledgeList): ultra.knowledge.KnowledgeList;

            /**
             * Encodes the specified KnowledgeList message. Does not implicitly {@link ultra.knowledge.KnowledgeList.verify|verify} messages.
             * @param message KnowledgeList message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.knowledge.IKnowledgeList, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified KnowledgeList message, length delimited. Does not implicitly {@link ultra.knowledge.KnowledgeList.verify|verify} messages.
             * @param message KnowledgeList message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.knowledge.IKnowledgeList, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a KnowledgeList message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns KnowledgeList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.knowledge.KnowledgeList;

            /**
             * Decodes a KnowledgeList message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns KnowledgeList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.knowledge.KnowledgeList;

            /**
             * Verifies a KnowledgeList message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a KnowledgeList message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns KnowledgeList
             */
            public static fromObject(object: { [k: string]: any }): ultra.knowledge.KnowledgeList;

            /**
             * Creates a plain object from a KnowledgeList message. Also converts values to other types if specified.
             * @param message KnowledgeList
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.knowledge.KnowledgeList, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this KnowledgeList to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for KnowledgeList
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a SearchKnowledgeRequest. */
        interface ISearchKnowledgeRequest {

            /** SearchKnowledgeRequest query */
            query?: (string|null);

            /** SearchKnowledgeRequest limit */
            limit?: (number|null);
        }

        /** Represents a SearchKnowledgeRequest. */
        class SearchKnowledgeRequest implements ISearchKnowledgeRequest {

            /**
             * Constructs a new SearchKnowledgeRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.knowledge.ISearchKnowledgeRequest);

            /** SearchKnowledgeRequest query. */
            public query: string;

            /** SearchKnowledgeRequest limit. */
            public limit: number;

            /**
             * Creates a new SearchKnowledgeRequest instance using the specified properties.
             * @param [properties] Properties to set
             * @returns SearchKnowledgeRequest instance
             */
            public static create(properties?: ultra.knowledge.ISearchKnowledgeRequest): ultra.knowledge.SearchKnowledgeRequest;

            /**
             * Encodes the specified SearchKnowledgeRequest message. Does not implicitly {@link ultra.knowledge.SearchKnowledgeRequest.verify|verify} messages.
             * @param message SearchKnowledgeRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.knowledge.ISearchKnowledgeRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified SearchKnowledgeRequest message, length delimited. Does not implicitly {@link ultra.knowledge.SearchKnowledgeRequest.verify|verify} messages.
             * @param message SearchKnowledgeRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.knowledge.ISearchKnowledgeRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a SearchKnowledgeRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns SearchKnowledgeRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.knowledge.SearchKnowledgeRequest;

            /**
             * Decodes a SearchKnowledgeRequest message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns SearchKnowledgeRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.knowledge.SearchKnowledgeRequest;

            /**
             * Verifies a SearchKnowledgeRequest message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a SearchKnowledgeRequest message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns SearchKnowledgeRequest
             */
            public static fromObject(object: { [k: string]: any }): ultra.knowledge.SearchKnowledgeRequest;

            /**
             * Creates a plain object from a SearchKnowledgeRequest message. Also converts values to other types if specified.
             * @param message SearchKnowledgeRequest
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.knowledge.SearchKnowledgeRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this SearchKnowledgeRequest to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for SearchKnowledgeRequest
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a CreateKnowledgeRequest. */
        interface ICreateKnowledgeRequest {

            /** CreateKnowledgeRequest name */
            name?: (string|null);

            /** CreateKnowledgeRequest description */
            description?: (string|null);

            /** CreateKnowledgeRequest content */
            content?: (string|null);

            /** CreateKnowledgeRequest contentType */
            contentType?: (string|null);

            /** CreateKnowledgeRequest category */
            category?: (string|null);

            /** CreateKnowledgeRequest tags */
            tags?: (string|null);

            /** CreateKnowledgeRequest priority */
            priority?: (number|null);

            /** CreateKnowledgeRequest tierPolicy */
            tierPolicy?: (string|null);
        }

        /** Represents a CreateKnowledgeRequest. */
        class CreateKnowledgeRequest implements ICreateKnowledgeRequest {

            /**
             * Constructs a new CreateKnowledgeRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: ultra.knowledge.ICreateKnowledgeRequest);

            /** CreateKnowledgeRequest name. */
            public name: string;

            /** CreateKnowledgeRequest description. */
            public description: string;

            /** CreateKnowledgeRequest content. */
            public content: string;

            /** CreateKnowledgeRequest contentType. */
            public contentType: string;

            /** CreateKnowledgeRequest category. */
            public category: string;

            /** CreateKnowledgeRequest tags. */
            public tags: string;

            /** CreateKnowledgeRequest priority. */
            public priority: number;

            /** CreateKnowledgeRequest tierPolicy. */
            public tierPolicy: string;

            /**
             * Creates a new CreateKnowledgeRequest instance using the specified properties.
             * @param [properties] Properties to set
             * @returns CreateKnowledgeRequest instance
             */
            public static create(properties?: ultra.knowledge.ICreateKnowledgeRequest): ultra.knowledge.CreateKnowledgeRequest;

            /**
             * Encodes the specified CreateKnowledgeRequest message. Does not implicitly {@link ultra.knowledge.CreateKnowledgeRequest.verify|verify} messages.
             * @param message CreateKnowledgeRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: ultra.knowledge.ICreateKnowledgeRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified CreateKnowledgeRequest message, length delimited. Does not implicitly {@link ultra.knowledge.CreateKnowledgeRequest.verify|verify} messages.
             * @param message CreateKnowledgeRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: ultra.knowledge.ICreateKnowledgeRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a CreateKnowledgeRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns CreateKnowledgeRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ultra.knowledge.CreateKnowledgeRequest;

            /**
             * Decodes a CreateKnowledgeRequest message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns CreateKnowledgeRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ultra.knowledge.CreateKnowledgeRequest;

            /**
             * Verifies a CreateKnowledgeRequest message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a CreateKnowledgeRequest message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns CreateKnowledgeRequest
             */
            public static fromObject(object: { [k: string]: any }): ultra.knowledge.CreateKnowledgeRequest;

            /**
             * Creates a plain object from a CreateKnowledgeRequest message. Also converts values to other types if specified.
             * @param message CreateKnowledgeRequest
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: ultra.knowledge.CreateKnowledgeRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this CreateKnowledgeRequest to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for CreateKnowledgeRequest
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Represents a KnowledgeService */
        class KnowledgeService extends $protobuf.rpc.Service {

            /**
             * Constructs a new KnowledgeService service.
             * @param rpcImpl RPC implementation
             * @param [requestDelimited=false] Whether requests are length-delimited
             * @param [responseDelimited=false] Whether responses are length-delimited
             */
            constructor(rpcImpl: $protobuf.RPCImpl, requestDelimited?: boolean, responseDelimited?: boolean);

            /**
             * Creates new KnowledgeService service using the specified rpc implementation.
             * @param rpcImpl RPC implementation
             * @param [requestDelimited=false] Whether requests are length-delimited
             * @param [responseDelimited=false] Whether responses are length-delimited
             * @returns RPC service. Useful where requests and/or responses are streamed.
             */
            public static create(rpcImpl: $protobuf.RPCImpl, requestDelimited?: boolean, responseDelimited?: boolean): KnowledgeService;

            /**
             * Calls ListKnowledge.
             * @param request Empty message or plain object
             * @param callback Node-style callback called with the error, if any, and KnowledgeList
             */
            public listKnowledge(request: ultra.common.IEmpty, callback: ultra.knowledge.KnowledgeService.ListKnowledgeCallback): void;

            /**
             * Calls ListKnowledge.
             * @param request Empty message or plain object
             * @returns Promise
             */
            public listKnowledge(request: ultra.common.IEmpty): Promise<ultra.knowledge.KnowledgeList>;

            /**
             * Calls GetKnowledgeEntry.
             * @param request IdRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and KnowledgeEntry
             */
            public getKnowledgeEntry(request: ultra.common.IIdRequest, callback: ultra.knowledge.KnowledgeService.GetKnowledgeEntryCallback): void;

            /**
             * Calls GetKnowledgeEntry.
             * @param request IdRequest message or plain object
             * @returns Promise
             */
            public getKnowledgeEntry(request: ultra.common.IIdRequest): Promise<ultra.knowledge.KnowledgeEntry>;

            /**
             * Calls CreateKnowledgeEntry.
             * @param request CreateKnowledgeRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and KnowledgeEntry
             */
            public createKnowledgeEntry(request: ultra.knowledge.ICreateKnowledgeRequest, callback: ultra.knowledge.KnowledgeService.CreateKnowledgeEntryCallback): void;

            /**
             * Calls CreateKnowledgeEntry.
             * @param request CreateKnowledgeRequest message or plain object
             * @returns Promise
             */
            public createKnowledgeEntry(request: ultra.knowledge.ICreateKnowledgeRequest): Promise<ultra.knowledge.KnowledgeEntry>;

            /**
             * Calls DeleteKnowledgeEntry.
             * @param request IdRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and DeleteResponse
             */
            public deleteKnowledgeEntry(request: ultra.common.IIdRequest, callback: ultra.knowledge.KnowledgeService.DeleteKnowledgeEntryCallback): void;

            /**
             * Calls DeleteKnowledgeEntry.
             * @param request IdRequest message or plain object
             * @returns Promise
             */
            public deleteKnowledgeEntry(request: ultra.common.IIdRequest): Promise<ultra.common.DeleteResponse>;

            /**
             * Calls SearchKnowledge.
             * @param request SearchKnowledgeRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and KnowledgeList
             */
            public searchKnowledge(request: ultra.knowledge.ISearchKnowledgeRequest, callback: ultra.knowledge.KnowledgeService.SearchKnowledgeCallback): void;

            /**
             * Calls SearchKnowledge.
             * @param request SearchKnowledgeRequest message or plain object
             * @returns Promise
             */
            public searchKnowledge(request: ultra.knowledge.ISearchKnowledgeRequest): Promise<ultra.knowledge.KnowledgeList>;
        }

        namespace KnowledgeService {

            /**
             * Callback as used by {@link ultra.knowledge.KnowledgeService#listKnowledge}.
             * @param error Error, if any
             * @param [response] KnowledgeList
             */
            type ListKnowledgeCallback = (error: (Error|null), response?: ultra.knowledge.KnowledgeList) => void;

            /**
             * Callback as used by {@link ultra.knowledge.KnowledgeService#getKnowledgeEntry}.
             * @param error Error, if any
             * @param [response] KnowledgeEntry
             */
            type GetKnowledgeEntryCallback = (error: (Error|null), response?: ultra.knowledge.KnowledgeEntry) => void;

            /**
             * Callback as used by {@link ultra.knowledge.KnowledgeService#createKnowledgeEntry}.
             * @param error Error, if any
             * @param [response] KnowledgeEntry
             */
            type CreateKnowledgeEntryCallback = (error: (Error|null), response?: ultra.knowledge.KnowledgeEntry) => void;

            /**
             * Callback as used by {@link ultra.knowledge.KnowledgeService#deleteKnowledgeEntry}.
             * @param error Error, if any
             * @param [response] DeleteResponse
             */
            type DeleteKnowledgeEntryCallback = (error: (Error|null), response?: ultra.common.DeleteResponse) => void;

            /**
             * Callback as used by {@link ultra.knowledge.KnowledgeService#searchKnowledge}.
             * @param error Error, if any
             * @param [response] KnowledgeList
             */
            type SearchKnowledgeCallback = (error: (Error|null), response?: ultra.knowledge.KnowledgeList) => void;
        }
    }
}
