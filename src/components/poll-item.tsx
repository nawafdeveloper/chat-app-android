import { Poll, PollOption } from '@/types/messages';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, ProgressBar, RadioButton, Text } from 'react-native-paper';

type PollComponentProps = {
    poll: Poll;
    onVote: (selectedOptions: number[]) => void;
    isDark?: boolean;
    isSent: boolean;
};

const PollComponent = ({ poll, onVote, isDark = false, isSent }: PollComponentProps) => {    
    const [selectedSingle, setSelectedSingle] = useState<string | null>(
        poll.poll_options.findIndex(opt => opt.user_voted).toString() || null
    );
    const [selectedMultiple, setSelectedMultiple] = useState<number[]>(
        poll.poll_options.reduce<number[]>((acc, opt, idx) => {
            if (opt.user_voted) acc.push(idx);
            return acc;
        }, [])
    );

    const handleSingleVote = (value: string) => {
        setSelectedSingle(value);
        onVote([parseInt(value)]);
    };

    const handleMultipleVote = (index: number) => {
        const newSelection = selectedMultiple.includes(index)
            ? selectedMultiple.filter(i => i !== index)
            : [...selectedMultiple, index];
        setSelectedMultiple(newSelection);
        onVote(newSelection);
    };

    const getPercentage = (votes: number) => {
        if (poll.total_votes === 0) return 0;
        return (votes / poll.total_votes) * 100;
    };

    const canVote = !poll.user_has_voted;

    return (
        <View>
            <View style={styles.headerRow}>
                <View style={styles.titleContainer}>
                    <Text variant="titleMedium" style={[styles.question, isDark && styles.textDark]}>
                        {poll.poll_question}
                    </Text>
                </View>
                <View style={styles.avatarContainer}>
                    <Avatar.Text size={28} label="JD" style={styles.avatar} />
                    <Avatar.Text size={28} label="AS" style={[styles.avatar, styles.avatarOverlap]} />
                    <Avatar.Text size={28} label="+8" style={[styles.avatar, styles.avatarOverlap]} />
                </View>
            </View>

            {poll.poll_multiple_answers ? (
                <View>
                    {poll.poll_options.map((option, index) => (
                        <PollOptionItem
                            key={index}
                            option={option}
                            isSelected={selectedMultiple.includes(index)}
                            onPress={() => canVote && handleMultipleVote(index)}
                            percentage={getPercentage(option.votes)}
                            totalVotes={poll.total_votes}
                            isDark={isDark}
                            isMultiple={true}
                            isSent={isSent}
                        />
                    ))}
                </View>
            ) : (
                <RadioButton.Group
                    onValueChange={handleSingleVote}
                    value={selectedSingle || ''}
                >
                    <View>
                        {poll.poll_options.map((option, index) => (
                            <PollOptionItem
                                key={index}
                                option={option}
                                isSelected={selectedSingle === index.toString()}
                                onPress={() => canVote && handleSingleVote(index.toString())}
                                percentage={getPercentage(option.votes)}
                                totalVotes={poll.total_votes}
                                isDark={isDark}
                                isMultiple={false}
                                radioValue={index.toString()}
                                isSent={isSent}
                            />
                        ))}
                    </View>
                </RadioButton.Group>
            )}
        </View>
    );
};

const PollOptionItem = ({
    option,
    isSelected,
    onPress,
    percentage,
    isDark,
    radioValue,
    isSent,
}: {
    option: PollOption;
    isSelected: boolean;
    onPress: () => void;
    percentage: number;
    totalVotes: number;
    isDark: boolean;
    isMultiple: boolean;
    radioValue?: string;
    isSent: boolean;
}) => {
    return (
        <View style={styles.optionContainer}>
            <View style={styles.optionRow}>
                <RadioButton
                    value={radioValue || ''}
                    status={isSelected ? 'checked' : 'unchecked'}
                    onPress={onPress}
                    color="#25D366"
                    uncheckedColor={isDark ? '#888' : '#666'}
                />
                <Text variant="bodyMedium" style={[styles.optionText, isDark && styles.textDark]}>
                    {option.text}
                </Text>
                <Text variant="labelSmall" style={[styles.voteCount, isDark && styles.textSecondaryDark]}>
                    {option.votes}
                </Text>
            </View>
            <ProgressBar
                progress={percentage / 100}
                color="#25D366"
                style={[styles.progressBar, {
                    backgroundColor: isSent ? isDark ? '#14402f' : '#b3d5ad' : isDark ? '#2f363a' : '#e3e1df'
                }]}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    titleContainer: {
        flex: 1,
        marginRight: 12,
    },
    question: {
        fontWeight: '600',
        marginBottom: 4,
    },
    subtitle: {
        opacity: 0.7,
    },
    avatarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        backgroundColor: '#E1E1E1',
    },
    avatarOverlap: {
        marginLeft: -8,
    },
    optionContainer: {
        marginBottom: 18
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    checkbox: {
        margin: 0,
        marginRight: 8,
    },
    optionText: {
        flex: 1,
    },
    voteCount: {
        marginLeft: 8,
        minWidth: 30,
        textAlign: 'right',
        opacity: 0.7,
    },
    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 36,
    },
    progressBar: {
        flex: 1,
        borderRadius: 99,
        height: 8
    },
    percentageText: {
        marginLeft: 8,
        minWidth: 35,
        textAlign: 'right',
        opacity: 0.7,
    },
    textDark: {
        color: '#FFFFFF',
    },
    textSecondaryDark: {
        color: '#8E8E93',
    },
});

export default PollComponent;